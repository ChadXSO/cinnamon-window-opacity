#!/bin/bash
# Removes the Window Opacity applet. All windows go back to solid.
UUID="window-opacity@ChadXSO"
python3 - "$UUID" <<'PY'
import subprocess, ast, sys
uuid = sys.argv[1]
cur = subprocess.check_output(['gsettings', 'get', 'org.cinnamon', 'enabled-applets']).decode().strip()
if cur.startswith('@as '):
    cur = cur[4:]
lst = [x for x in ast.literal_eval(cur) if ':' + uuid + ':' not in x]
subprocess.check_call(['gsettings', 'set', 'org.cinnamon', 'enabled-applets', str(lst)])
PY
rm -rf "$HOME/.local/share/cinnamon/applets/$UUID"
echo "Removed. Your saved settings are still in ~/.config/window-opacity/ (delete that folder to forget them)."
