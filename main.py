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


def find_npm() -> str:
    """Return the executable npm shim for the current operating system.

    npm is installed as ``npm.cmd`` on Windows.  Passing only ``npm`` to
    CreateProcess does not reliably apply PATHEXT lookup, even when
    ``shutil.which('npm')`` found the command during the prerequisite check.
    Resolve the real shim once and pass its absolute path to subprocess.
    """
    candidates = ("npm.cmd", "npm.exe", "npm") if sys.platform == "win32" else ("npm",)
    for candidate in candidates:
        executable = shutil.which(candidate)
        if executable:
            return executable
    raise SystemExit(
        "CrowdNet requires Node.js and npm. Install Node.js 20+ from "
        "https://nodejs.org/ and restart your terminal."
    )


def run(command: list[str]) -> None:
    """Run a bootstrap command in the project directory or exit clearly."""
    print(f"[CrowdNet] {' '.join(command)}", flush=True)
    try:
        subprocess.run(command, cwd=ROOT, check=True)
    except FileNotFoundError as error:
        raise SystemExit(
            f"CrowdNet could not start '{command[0]}'. Reinstall Node.js 20+ "
            "and ensure its installation directory is present in PATH."
        ) from error
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode) from error


def main() -> None:
    npm = find_npm()

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
        print("[CrowdNet] Preparing the desktop runtime (first launch only)...")
        run([npm, "install", "--no-audit", "--no-fund"])

    if not electron_binary.exists():
        raise SystemExit(
            "Electron installation completed but its launcher was not created. "
            "Delete node_modules and run this application again."
        )

    run([str(electron_binary), str(ROOT / "main.js")])


if __name__ == "__main__":
    main()
