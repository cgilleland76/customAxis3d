"""Turn a Spec into an editable listing draft -- never a blank page.

Emits two things:
  copy_draft.md  -- a filled-in listing you edit down
  copy_prompt.txt -- paste into Claude for a stronger rewrite in your voice
"""

from __future__ import annotations


def _title(meta: dict, spec) -> str:
    name = meta.get("name") or (spec.object_names[0] if spec.object_names else "Untitled")
    bits = [name]
    if meta.get("category"):
        bits.append(meta["category"])
    return " - ".join(bits)


def spec_table(spec, price: dict, symbol: str = "$") -> str:
    rows = [
        ("Dimensions", spec.dimensions_human),
        ("Print time", spec.print_time_human),
        ("Material", ", ".join(spec.materials) or "PLA"),
        ("Filament used", f"{spec.total_weight_g:g} g"),
        ("Colors", str(spec.color_count)),
    ]
    if spec.layer_height:
        rows.append(("Layer height", f"{spec.layer_height:g} mm"))
    width = max(len(k) for k, _ in rows)
    lines = ["| Spec | Value |", "|---|---|"]
    lines += [f"| {k} | {v} |" for k, v in rows]
    return "\n".join(lines)


def tags(meta: dict, spec, cfg: dict) -> list:
    out = list(cfg.get("copy", {}).get("base_tags", []))
    out += [t.lower() for t in meta.get("tags", [])]
    for m in spec.materials:
        out.append(m.lower())
    if spec.color_count > 1:
        out.append("multicolor")
    if meta.get("category"):
        out.append(str(meta["category"]).lower())
    seen, uniq = set(), []
    for t in out:
        if t and t not in seen:
            seen.add(t)
            uniq.append(t)
    return uniq


def description(meta: dict, spec) -> str:
    """The prose body only -- what goes in the product row's description column."""
    # The card already shows size, weight and time as chips, and the admin
    # field is capped at 90 characters -- so the blurb is your sentence, not
    # a restatement of the spec.
    notes = (meta.get("notes") or "").strip()
    if notes:
        return notes
    return (f"Printed to order in {', '.join(spec.materials) or 'PLA'}. "
            f"Measures {spec.dimensions_human}.")


def draft(meta: dict, spec, price: dict, cfg: dict) -> str:
    sym = cfg.get("shop", {}).get("currency_symbol", "$")
    name = _title(meta, spec)
    price_line = (f"**Price:** {sym}{price['price']:.2f}"
                  if price.get("price") is not None
                  else f"**Price:** TODO -- {price.get('reason', 'not priced')}")
    notes = meta.get("notes", "")
    colors = ", ".join(f.color for f in spec.filaments if f.color) or "as pictured"

    body = [
        f"# {name}",
        "",
        price_line,
        "",
        "## Description",
        "",
        f"{notes or 'TODO: one or two sentences on what this is and who it is for.'}",
        "",
        f"Printed to order at {spec.layer_height or 0.2:g} mm layers in "
        f"{', '.join(spec.materials) or 'PLA'}. Measures {spec.dimensions_human}."
        + (f" Each one takes about {spec.print_time_human} on the machine."
           if spec.print_time_s else ""),
        "",
        "## Details",
        "",
        f"- {spec.dimensions_human}",
        f"- {', '.join(spec.materials) or 'PLA'}"
        + (f", {spec.total_weight_g:g} g of filament" if spec.total_weight_g else ""),
        f"- {spec.color_count} color{'s' if spec.color_count != 1 else ''} ({colors})",
        "- Made to order, ships in 3-5 business days",
        "",
    ]
    if cfg.get("copy", {}).get("include_spec_table", True):
        body += ["## Specs", "", spec_table(spec, price, sym), ""]
    body += ["## Tags", "", ", ".join(tags(meta, spec, cfg)), ""]
    return "\n".join(body)


def prompt(meta: dict, spec, price: dict, cfg: dict) -> str:
    tone = cfg.get("copy", {}).get("tone", "plain, specific, no hype")
    return "\n".join([
        "Write a product listing for a 3D-printed item sold on my site.",
        f"Tone: {tone}. No filler, no exclamation marks, no 'perfect gift for'.",
        "",
        "Facts (use only these, do not invent features):",
        f"- Name: {_title(meta, spec)}",
        f"- Category: {meta.get('category', 'n/a')}",
        f"- Dimensions: {spec.dimensions_human}",
        f"- Material: {', '.join(spec.materials) or 'PLA'}",
        f"- Filament used: {spec.total_weight_g:g} g",
        f"- Print time: {spec.print_time_human}",
        f"- Colors: {spec.color_count}",
        f"- Layer height: {spec.layer_height or 0.2:g} mm",
        f"- My notes: {meta.get('notes', '(none)')}",
        "",
        "Give me: a title under 60 characters, a 2-sentence hook, "
        "4 bullet points, and 10 search tags.",
    ])
