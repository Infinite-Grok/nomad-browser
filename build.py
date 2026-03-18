"""Build Nomad Browser standalone executable.

Usage: python build.py
Output: dist/NomadBrowser/NomadBrowser.exe (Windows)
"""

import subprocess
import sys

def build():
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name", "NomadBrowser",
        "--onedir",
        "--windowed",
        "--add-data", "static;static" if sys.platform == "win32" else "static:static",
        "--add-data", "templates;templates" if sys.platform == "win32" else "templates:templates",
        "--add-data", "data;data" if sys.platform == "win32" else "data:data",
        "--hidden-import", "nomad_browser",
        "--hidden-import", "nomad_browser.game",
        "--hidden-import", "nomad_browser.game.engine",
        "--hidden-import", "nomad_browser.game.identity",
        "--hidden-import", "nomad_browser.game.inventory",
        "--hidden-import", "nomad_browser.game.loot_library",
        "--hidden-import", "nomad_browser.game.loot_scanner",
        "--hidden-import", "nomad_browser.game.claims",
        "--hidden-import", "nomad_browser.routes_game",
        "--hidden-import", "nomad_browser.routes_chatroom",
        "--hidden-import", "waitress",
        "--hidden-import", "webview",
        "--hidden-import", "requests",
        # Collect ALL of RNS and LXMF (they use dynamic imports PyInstaller can't trace)
        "--collect-all", "RNS",
        "--collect-all", "LXMF",
        "--noconfirm",
        "run.py",
    ]

    print("Building Nomad Browser...")
    print(f"Command: {' '.join(cmd)}")
    result = subprocess.run(cmd)

    if result.returncode == 0:
        print("\nBuild complete!")
        print("Output: dist/NomadBrowser/")
        print("Run:    dist/NomadBrowser/NomadBrowser.exe")
    else:
        print(f"\nBuild failed with exit code {result.returncode}")
        sys.exit(1)


if __name__ == "__main__":
    build()
