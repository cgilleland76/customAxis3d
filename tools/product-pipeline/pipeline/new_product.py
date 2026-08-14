#!/usr/bin/env python3
"""
Guided product creation: pick a sliced file, answer a few questions, done.

Replaces the manual routine of making an inbox folder, hand-writing
product.yml, guessing slot names, running the build, then correcting the names
afterwards. The file is read *before* you are asked anything, so the prompts
can show each filament's colour and weight -- which is the only way to know
which slot is the body and which is a latch.

    python3 -m pipeline.new_product                 # file picker
    python3 -m pipeline.new_product path/to.3mf     # or name it directly
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import env as _env          # noqa: E402
_env.load()

from pipeline.spec3mf import load_spec    # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def pick_file():
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk(); root.withdraw(); root.attributes("-topmost", True)
        p = filedialog.askopenfilename(
            title="Pick the sliced file from Orca",
            filetypes=[("Sliced 3MF / gcode", "*.3mf *.gcode"), ("All files", "*.*")])
        root.destroy()
        return Path(p) if p else None
    except Exception:
        raw = input("  Full path to the sliced file: ").strip().strip('"')
        return Path(raw) if raw else None


def ask(label, default=""):
    suffix = f" [{default}]" if default else ""
    try:
        got = input(f"  {label}{suffix}: ").strip()
    except EOFError:
        return default
    return got or default


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "product"


def main():
    print("\n  New product\n  " + "-" * 46)

    src = Path(sys.argv[1]) if len(sys.argv) > 1 else pick_file()
    if not src or not src.is_file():
        print("  No file chosen.")
        return 1

    print(f"\n  Reading {src.name} ...")
    try:
        spec = load_spec(src)
    except Exception as e:
        print(f"  Could not read that file: {e}")
        return 1

    used = [f for f in spec.filaments if f.used_g > 0]
    if not spec.print_time_s:
        print("\n  ! This file has no slice results, so it cannot be priced.")
        print("    Export the sliced plate from Orca rather than saving the project.")
        if ask("Carry on anyway? (y/N)", "n").lower() != "y":
            return 1

    print(f"\n  {spec.print_time_human} · {spec.total_weight_g:g} g · "
          f"{len(used)} colour(s) · {spec.dimensions_human}")
    for w in spec.warnings:
        print(f"  ! {w}")

    default_name = re.sub(r"[_-]?(PLA|PETG|ABS|TPU|ASA).*$", "", src.stem, flags=re.I)
    default_name = re.sub(r"\.gcode$", "", default_name, flags=re.I).replace("_", " ").strip()

    print()
    name = ask("Product name", default_name)
    category = ask("Category", "Gifts")
    notes = ask("One sentence for the shop card")

    print("\n  Name each colour slot. The weight tells you which is which --")
    print("  the heaviest is usually the body, the lightest an accent.\n")
    labels = []
    for f in used:
        hint = f"slot {f.index}  {f.color or '-':<9} {f.used_g:>7.2f} g"
        labels.append(ask(f"{hint}  ->", f"Colour {len(labels) + 1}"))

    dims = ask("\n  Assembled size (blank to use the estimate)",
               "" if len(used) > 1 else spec.dimensions_human)

    slug = slugify(name)
    dest = ROOT / "inbox" / slug
    if dest.exists():
        if ask(f"\n  inbox/{slug} already exists. Overwrite? (y/N)", "n").lower() != "y":
            return 1
        shutil.rmtree(dest, ignore_errors=True)
    dest.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest / "sliced.gcode.3mf")

    lines = [f'name: "{name}"']
    if category:
        lines.append(f'category: "{category}"')
    if notes:
        lines.append(f'notes: "{notes}"')
    lines.append("slots:")
    lines += [f"  - {l}" for l in labels]
    if dims:
        lines.append(f'dimensions: "{dims}"')
    (dest / "product.yml").write_text("\n".join(lines) + "\n")

    print(f"\n  Staged inbox/{slug}/")
    if ask("  Build and publish as a draft now? (Y/n)", "y").lower() == "n":
        print('  Left in the inbox. Run "Add products" when ready.')
        return 0

    print()
    return subprocess.call([sys.executable, "-m", "pipeline.watch", "--once"], cwd=str(ROOT))


if __name__ == "__main__":
    raise SystemExit(main())
