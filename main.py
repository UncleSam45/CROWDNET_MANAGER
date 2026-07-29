"""Bootstrap and launch the CrowdNet desktop portal.

The launcher intentionally keeps Node dependencies local to this project.  It
checks the manifest, installs Electron when it is missing, and then hands off
to the JavaScript application.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PACKAGE_JSON = ROOT / "package.json"


def run(command: list[str]) -> None:
    """Run a bootstrap command in the project directory or exit clearly."""
    print(f"[CrowdNet] {' '.join(command)}", flush=True)
    try:
        subprocess.run(command, cwd=ROOT, check=True)
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode) from error


def main() -> None:
    if not shutil.which("npm"):
        raise SystemExit(
            "CrowdNet requires Node.js and npm. Install Node.js 20+ and try again."
        )

    if not PACKAGE_JSON.exists():
        raise SystemExit(f"Missing application manifest: {PACKAGE_JSON}")

    manifest = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    electron_version = manifest.get("devDependencies", {}).get("electron")
    if not electron_version:
        raise SystemExit("Electron is not declared in package.json")

    electron_binary = ROOT / "node_modules" / ".bin" / (
        "electron.cmd" if sys.platform == "win32" else "electron"
    )
    if not electron_binary.exists():
        print("[CrowdNet] Preparing the desktop runtime (first launch only)…")
        run(["npm", "install", "--no-audit", "--no-fund"])

    run([str(electron_binary), str(ROOT / "main.js")])


if __name__ == "__main__":
    main()
