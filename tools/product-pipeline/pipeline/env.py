"""
Load credentials from a .env file next to config.yml.

A double-clicked batch file gets no PowerShell session, so it cannot inherit
$env: variables you typed earlier. Reading .env keeps the key out of the batch
file itself and out of git (.gitignore already covers it).

    SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_SERVICE_KEY=eyJ...

Existing environment variables always win, so a terminal run can still
override the file.
"""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(path=None) -> int:
    """Read .env into os.environ. Returns how many keys were set."""
    env = Path(path) if path else ROOT / ".env"
    if not env.is_file():
        return 0
    n = 0
    for raw in env.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val
            n += 1
    return n


def describe() -> str:
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY", "")
    if not url or not key:
        return ("no Supabase credentials — copy .env.example to .env and put "
                "your keys in it")
    return f"connected to {url.split('//')[-1].split('.')[0]} (key ...{key[-6:]})"
