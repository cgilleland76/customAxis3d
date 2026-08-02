"""
Watch an inbox folder and turn each drop into a draft product automatically.

    python3 -m pipeline.watch                 # watch inbox/, publish drafts
    python3 -m pipeline.watch --dry-run       # process but never touch Supabase
    python3 -m pipeline.watch --no-publish    # build locally only

Drop either shape into inbox/:

    inbox/alliance-credits/          <- a folder (best: lets you add photos + yml)
        Alliance Credits.gcode.3mf
        Alliance Credits.3mf
        photos/
        product.yml
    inbox/Alliance Credits.gcode.3mf <- or just a loose file

A drop is only processed once its size and mtime have stopped changing, so a
half-copied 300 MB file is never parsed. Processed drops move to inbox/_done/.
Polling, not inotify -- works over network shares and needs no dependencies.
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import env as _env  # noqa: E402
_env.load()

from pipeline.build import build_one, load_yaml   # noqa: E402
from pipeline.archive import archive_product      # noqa: E402
from pipeline.slicing import ensure_sliced        # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MODEL_EXT = {".3mf", ".gcode", ".gco"}


def slugify(name: str) -> str:
    s = re.sub(r"\.gcode$", "", Path(name).stem, flags=re.I)
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return re.sub(r"-+", "-", s) or "product"


def signature(path: Path):
    """Size + mtime of everything in a drop; unchanged twice == finished copying."""
    if path.is_file():
        st = path.stat()
        return (st.st_size, int(st.st_mtime))
    out = []
    for p in sorted(path.rglob("*")):
        if p.is_file():
            st = p.stat()
            out.append((str(p), st.st_size, int(st.st_mtime)))
    return tuple(out)


def settle(path: Path, interval: float, tries: int = 3) -> bool:
    prev = signature(path)
    stable = 0
    while stable < tries:
        time.sleep(interval)
        if not path.exists():
            return False
        cur = signature(path)
        stable = stable + 1 if cur == prev else 0
        prev = cur
    return True


def stage(drop: Path, products_dir: Path) -> Path:
    """Move a drop into products/<slug>/, merging loose files into one folder."""
    slug = slugify(drop.name)
    dest = products_dir / slug
    dest.mkdir(parents=True, exist_ok=True)

    if drop.is_file():
        shutil.copy2(drop, dest / drop.name)
    else:
        for item in drop.iterdir():
            target = dest / item.name
            if item.is_dir():
                shutil.copytree(item, target, dirs_exist_ok=True)
            else:
                shutil.copy2(item, target)
    return dest


def has_model(path: Path) -> bool:
    if path.is_file():
        return path.suffix.lower() in MODEL_EXT
    return any(p.suffix.lower() in MODEL_EXT for p in path.rglob("*"))


def process(drop: Path, cfg: dict, args) -> None:
    print(f"\n[watch] picked up {drop.name}")
    if not settle(drop, args.interval):
        print("[watch]   vanished before it settled, skipping")
        return
    if not has_model(drop):
        print("[watch]   no .3mf/.gcode inside, ignoring")
        return

    folder = stage(drop, ROOT / "products")

    # If only a project was dropped, let Orca produce the sliced export for us.
    made, note = ensure_sliced(folder, cfg)
    if note:
        print(f"[watch]   auto-slice failed: {note}")
    elif made:
        print(f"[watch]   auto-sliced -> {made.name}")

    record = build_one(folder, cfg, dry_run=False)

    if record.get("change_status") == "identical" and not args.force:
        print("[watch]   skipping publish -- nothing changed since last time "
              "(use --force to push anyway)")
    elif args.no_publish:
        print("[watch]   built locally (--no-publish)")
    elif not record.get("priceable", True):
        print("[watch]   NOT published: no slice data, so no price. "
              "Add the *.gcode.3mf export and drop it again.")
    else:
        from pipeline.publish import publish, PublishError
        try:
            out = publish(record, folder / "_generated", cfg, dry_run=args.dry_run)
            verb = "would publish" if args.dry_run else "published"
            print(f"[watch]   {verb} draft '{record['slug']}' "
                  f"({len(out['images'])} image(s))")
        except PublishError as e:
            print(f"[watch]   publish failed: {e}")
            return

    # File the models away: projects to the model library, exports to uploads.
    for src, dest, action in archive_product(folder, record["slug"], cfg,
                                             dry_run=args.dry_run):
        if dest is None or str(action).startswith("SKIPPED"):
            print(f"[watch]   archive: {src.name} -> {action}")
        else:
            print(f"[watch]   archive: {action} {src.name} -> {dest}")

    done = drop.parent / "_done"
    done.mkdir(exist_ok=True)
    target = done / drop.name
    if target.exists():
        target = done / f"{drop.stem}-{int(time.time())}{drop.suffix}"
    shutil.move(str(drop), str(target))
    print(f"[watch]   moved to _done/{target.name}")


def main():
    ap = argparse.ArgumentParser(description="Watch a folder and publish drafts.")
    ap.add_argument("--inbox", default=str(ROOT / "inbox"))
    ap.add_argument("--config", default=str(ROOT / "config.yml"))
    ap.add_argument("--interval", type=float, default=2.0,
                    help="seconds between settle checks")
    ap.add_argument("--dry-run", action="store_true",
                    help="build and map, but never write to Supabase")
    ap.add_argument("--no-publish", action="store_true",
                    help="build locally only, skip Supabase entirely")
    ap.add_argument("--force", action="store_true",
                    help="publish even when the files are byte-identical")
    ap.add_argument("--once", action="store_true",
                    help="process what is there now, then exit")
    args = ap.parse_args()

    cfg = load_yaml(Path(args.config))
    inbox = Path(args.inbox)
    inbox.mkdir(parents=True, exist_ok=True)
    (inbox / "_done").mkdir(exist_ok=True)

    mode = ("dry-run" if args.dry_run else
            "local only" if args.no_publish else "publishing drafts")
    print(f"[watch] {_env.describe()}")
    print(f"[watch] watching {inbox}  ({mode})")
    print("[watch] drop a folder or a .3mf in there. ctrl-c to stop.\n")

    seen = set()
    try:
        while True:
            for drop in sorted(inbox.iterdir()):
                if drop.name.startswith((".", "_")) or drop in seen:
                    continue
                try:
                    process(drop, cfg, args)
                except Exception:
                    traceback.print_exc()
                    seen.add(drop)          # do not loop forever on a bad drop
            if args.once:
                break
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\n[watch] stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
