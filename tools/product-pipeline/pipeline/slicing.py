"""
Optional auto-slice hook.

We deliberately do NOT reimplement Orca CLI handling here. The script from the
"3MF slicing to gcode" session already repairs Bambu sentinel values
(raft_first_layer_expansion / tree_support_wall_count = -1) and missing
G92 E0 on relative-E files -- three failure modes a naive CLI call walks into.

Point config.yml at it:

    slicer:
      enabled: true
      script: "C:/Users/chase/Documents/orca-quote.ps1"

The script must accept the project .3mf and leave a *.gcode.3mf beside it.
If it is not configured, this is a no-op and the pipeline just needs you to
drop the sliced export yourself.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


def ensure_sliced(folder: Path, cfg: dict):
    """Returns (produced_path_or_None, note_or_None). Never raises."""
    scfg = cfg.get("slicer", {}) or {}
    if not scfg.get("enabled"):
        return None, None

    models = sorted(folder.glob("*.3mf"))
    sliced = [m for m in models if m.name.lower().endswith(".gcode.3mf")]
    projects = [m for m in models if m not in sliced]
    if sliced or not projects:
        return None, None

    script = scfg.get("script")
    if not script or not Path(script).is_file():
        return None, ("slicer.enabled is true but slicer.script does not point at "
                      "a file. Set it to your Orca slicing script, or drop the "
                      "*.gcode.3mf export in yourself.")

    project = max(projects, key=lambda p: p.stat().st_size)
    script = Path(script)

    if script.suffix.lower() == ".ps1":
        exe = shutil.which("pwsh") or shutil.which("powershell")
        if not exe:
            return None, "PowerShell not found on PATH; cannot run the slicing script."
        cmd = [exe, "-NoProfile", "-ExecutionPolicy", "Bypass",
               "-File", str(script), str(project)]
    elif script.suffix.lower() == ".py":
        cmd = [sys.executable, str(script), str(project)]
    else:
        cmd = [str(script), str(project)]

    print(f"  slicing via {script.name} ...")
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              timeout=float(scfg.get("timeout_s", 1800)))
    except subprocess.TimeoutExpired:
        return None, f"slicing script timed out after {scfg.get('timeout_s', 1800)}s"
    except OSError as e:
        return None, f"could not run {script.name}: {e}"

    produced = sorted(folder.glob("*.gcode.3mf"))
    if produced:
        return produced[0], None

    tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-4:]
    return None, (f"{script.name} exited {proc.returncode} without producing a "
                  f"*.gcode.3mf" + ("\n    " + "\n    ".join(tail) if tail else ""))
