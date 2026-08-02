"""
File it away after publishing: projects to your 3D model library, sliced
exports to your upload folder.

    archive:
      enabled: true
      model_dir: "D:/3D Models"        # *.3mf  (editable projects)
      gcode_dir: "D:/Uploads"          # *.gcode.3mf  (printer-ready)
      subfolder_by_slug: true
      move: true                        # false to copy and leave originals
      on_conflict: rename               # rename | overwrite | skip
"""

from __future__ import annotations

import shutil
import time
from pathlib import Path


def _destination(base: Path, slug: str, name: str, cfg: dict) -> Path:
    acfg = cfg.get("archive", {})
    target_dir = base / slug if acfg.get("subfolder_by_slug", True) else base
    target_dir.mkdir(parents=True, exist_ok=True)
    dest = target_dir / name

    if dest.exists():
        mode = acfg.get("on_conflict", "rename")
        if mode == "skip":
            return None
        if mode == "rename":
            stem = name
            suffix = ""
            for ext in (".gcode.3mf", ".3mf", ".gcode"):
                if name.lower().endswith(ext):
                    stem, suffix = name[: -len(ext)], ext
                    break
            dest = target_dir / f"{stem}-{time.strftime('%Y%m%d-%H%M%S')}{suffix}"
    return dest


def archive_product(folder: Path, slug: str, cfg: dict, dry_run=False) -> list:
    """Route each model file to its home. Returns [(src, dest, action)]."""
    acfg = cfg.get("archive", {})
    if not acfg.get("enabled"):
        return []

    model_dir = acfg.get("model_dir")
    gcode_dir = acfg.get("gcode_dir")
    move = acfg.get("move", True)
    moved = []

    for src in sorted(folder.glob("*.3mf")) + sorted(folder.glob("*.gcode")):
        is_sliced = src.name.lower().endswith((".gcode.3mf", ".gcode"))
        base = gcode_dir if is_sliced else model_dir
        if not base:
            continue

        base = Path(base).expanduser()
        if not dry_run and not base.parent.exists():
            moved.append((src, base, f"SKIPPED - {base.parent} does not exist"))
            continue

        dest = _destination(base, slug, src.name, cfg)
        if dest is None:
            moved.append((src, None, "skipped (already there)"))
            continue

        action = "move" if move else "copy"
        if not dry_run:
            if move:
                shutil.move(str(src), str(dest))
            else:
                shutil.copy2(src, dest)
        moved.append((src, dest, action))
    return moved
