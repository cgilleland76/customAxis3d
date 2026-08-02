"""Turn a Spec into a defensible price, from rates you set once in config.yml."""

from __future__ import annotations
import math

from pipeline.rates import fetch_rates, price_like_the_app

_RATE_CACHE = {}


def _rate_for(material: str, table: dict) -> float:
    if not material:
        return float(table.get("default", 0))
    m = material.upper()
    for key, val in table.items():
        if key.upper() == m:
            return float(val)
    return float(table.get("default", 0))


def price_from_spec(spec, cfg: dict) -> dict:
    p = cfg.get("pricing", {})

    if spec.print_time_s <= 0 and spec.total_weight_g <= 0:
        return {"priceable": False, "price": None,
                "reason": "no slice data in the file (no print time, no filament weight)",
                "cost_material": None, "cost_machine": None, "cost_labor": None,
                "cost_subtotal": None, "cost_with_failure_buffer": None,
                "price_raw": None, "margin_abs": None, "margin_pct": None,
                "per_filament": [], "hours": 0.0}

    # Prefer the rates your Shop tools > Pricing tab already owns, so there is
    # one place to change a rate rather than two that drift apart.
    if p.get("source", "app") == "app":
        if "rates" not in _RATE_CACHE:
            _RATE_CACHE["rates"], _RATE_CACHE["note"] = fetch_rates(cfg)
        rates, note = _RATE_CACHE["rates"], _RATE_CACHE["note"]
        if rates:
            out = price_like_the_app(spec.total_weight_g, spec.print_time_h,
                                     rates, p.get("model", "markup"))
            out["rate_note"] = note
            out["rates_used"] = rates
            return out
        print(f"  ! {note}")

    table = p.get("filament_cost_per_kg", {"default": 22.0})

    material_cost = 0.0
    per_filament = []
    for f in spec.filaments:
        if f.used_g <= 0:
            continue
        rate = _rate_for(f.type, table)
        cost = (f.used_g / 1000.0) * rate
        material_cost += cost
        per_filament.append({
            "index": f.index, "type": f.type, "color": f.color,
            "grams": round(f.used_g, 2), "rate_per_kg": rate, "cost": round(cost, 4),
        })

    hours = spec.print_time_h
    machine_cost = hours * float(p.get("machine_rate_per_hour", 0))
    labor_cost = float(p.get("labor_flat", 0)) + hours * float(p.get("labor_per_hour", 0))

    subtotal = material_cost + machine_cost + labor_cost
    with_failure = subtotal * (1 + float(p.get("failure_rate", 0)))
    raw_price = with_failure * float(p.get("margin_multiplier", 1))
    price = _round_price(max(raw_price, float(p.get("min_price", 0))),
                         p.get("round_style", "charm"))

    return {
        "priceable": True,
        "cost_material": round(material_cost, 2),
        "cost_machine": round(machine_cost, 2),
        "cost_labor": round(labor_cost, 2),
        "cost_subtotal": round(subtotal, 2),
        "cost_with_failure_buffer": round(with_failure, 2),
        "price_raw": round(raw_price, 2),
        "price": price,
        "margin_abs": round(price - with_failure, 2),
        "margin_pct": round((price - with_failure) / price * 100, 1) if price else 0.0,
        "per_filament": per_filament,
        "hours": round(hours, 2),
    }


def _round_price(value: float, style: str) -> float:
    if style == "none":
        return round(value, 2)
    if style == "whole":
        return float(math.ceil(value))
    # charm: round up to the next x.99
    base = math.floor(value)
    return round(base + 0.99 if value <= base + 0.99 else base + 1.99, 2)


def explain(breakdown: dict, symbol: str = "$") -> str:
    b = breakdown
    if not b.get("priceable", True):
        return f"  PRICE             -- not priced: {b['reason']}"

    if b.get("rate_source") == "app":
        lines = [
            f"  [{b.get('rate_note', 'app rates')}]",
            f"  filament          {symbol}{b['cost_material']:>7.2f}",
            f"  electricity       {symbol}{b['cost_electricity']:>7.2f}"
            f"   ({b['hours']}h)",
        ]
        if b.get("cost_flat"):
            lines.append(f"  flat fee          {symbol}{b['cost_flat']:>7.2f}")
        lines += [
            f"  {'-' * 26}",
            f"  cost              {symbol}{b['cost_subtotal']:>7.2f}",
            f"  markup model      {symbol}{b['price_markup_model']:>7.0f}",
            f"  hourly model      {symbol}{b['price_hourly_model']:>7.0f}",
            f"  PRICE ({b['pricing_model']})   {symbol}{b['price']:>7.0f}",
        ]
        return "\n".join(lines)
    lines = [
        f"  material          {symbol}{b['cost_material']:>7.2f}",
        f"  machine ({b['hours']}h)  {symbol}{b['cost_machine']:>7.2f}",
        f"  labor             {symbol}{b['cost_labor']:>7.2f}",
        f"  {'-' * 26}",
        f"  cost              {symbol}{b['cost_subtotal']:>7.2f}",
        f"  + failure buffer  {symbol}{b['cost_with_failure_buffer']:>7.2f}",
        f"  PRICE             {symbol}{b['price']:>7.2f}"
        f"   ({symbol}{b['margin_abs']:.2f} margin, {b['margin_pct']}%)",
    ]
    return "\n".join(lines)
