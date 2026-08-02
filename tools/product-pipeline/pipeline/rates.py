"""
Read pricing rates from the Axis3D app, not from config.yml.

The Pricing tab in Shop tools already owns these numbers and stores them in
public.settings under key 'rates'. Duplicating them in config.yml means two
places to change and two prices that drift apart, so the pipeline reads the
same row the quote calculator does.

Falls back to config.yml only if the settings row is missing, and says so.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

RATE_KEYS = ["filamentPerKg", "watts", "kwhPrice", "markup", "hourlyRate", "flatFee"]


def fetch_rates(cfg: dict):
    """Returns (rates_dict, source_note). rates_dict is None if unavailable."""
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY", "")
    if not url or not key:
        return None, "no Supabase credentials; using config.yml rates"

    endpoint = f"{url}/rest/v1/settings?key=eq.rates&select=value"
    req = urllib.request.Request(endpoint, headers={
        "apikey": key, "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            rows = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return None, f"settings read failed ({e.code}); using config.yml rates"
    except (urllib.error.URLError, json.JSONDecodeError) as e:
        return None, f"settings unreachable ({e}); using config.yml rates"

    if not rows:
        return None, ("no 'rates' row in settings -- open Shop tools > Pricing "
                      "and hit Save rates; using config.yml until then")

    raw = rows[0].get("value") or {}
    out = {}
    for k in RATE_KEYS:
        try:
            out[k] = float(raw.get(k, 0) or 0)
        except (TypeError, ValueError):
            out[k] = 0.0
    return out, "rates from Shop tools > Pricing"


def price_like_the_app(grams: float, hours: float, rates: dict, model: str = "markup"):
    """Reproduce quote.js exactly.

        filCost  = grams / 1000 * filamentPerKg
        elecCost = watts / 1000 * hours * kwhPrice
        cost     = filCost + elecCost + flatFee
        markup   -> round(cost * markup)
        hourly   -> round(cost + hourlyRate * hours)

    Whole dollars, because that is what the app shows.
    """
    fil = grams / 1000.0 * rates.get("filamentPerKg", 0)
    elec = rates.get("watts", 0) / 1000.0 * hours * rates.get("kwhPrice", 0)
    flat = rates.get("flatFee", 0)
    cost = fil + elec + flat

    markup_price = round(cost * (rates.get("markup", 1) or 1))
    hourly_price = round(cost + rates.get("hourlyRate", 0) * hours)
    price = hourly_price if model == "hourly" else markup_price

    return {
        "priceable": True,
        "rate_source": "app",
        "pricing_model": model,
        "cost_material": round(fil, 2),
        "cost_electricity": round(elec, 2),
        "cost_flat": round(flat, 2),
        "cost_subtotal": round(cost, 2),
        "cost_with_failure_buffer": round(cost, 2),
        "price": float(price),
        "price_raw": round(cost * (rates.get("markup", 1) or 1), 2),
        "price_markup_model": float(markup_price),
        "price_hourly_model": float(hourly_price),
        "margin_abs": round(price - cost, 2),
        "margin_pct": round((price - cost) / price * 100, 1) if price else 0.0,
        "hours": round(hours, 2),
        "cost_machine": round(elec, 2),
        "cost_labor": round(flat, 2),
        "per_filament": [],
    }
