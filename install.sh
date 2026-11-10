#!/bin/bash
# Installs the Window Opacity applet for Cinnamon and puts it on your bottom panel.
set -e
UUID="window-opacity@ChadXSO"
SRC="$(cd "$(dirname "$0")" && pwd)/$UUID"
DEST="$HOME/.local/share/cinnamon/applets/$UUID"

if [ ! -f "$SRC/applet.js" ]; then
  echo "Can't find $SRC - run this from inside the cloned repo."; exit 1
fi

mkdir -p "$HOME/.local/share/cinnamon/applets"
rm -rf "$DEST"
cp -r "$SRC" "$DEST"

# back up the panel layout first
mkdir -p "$HOME/.config/window-opacity"
gsettings get org.cinnamon enabled-applets > "$HOME/.config/window-opacity/enabled-applets.bak"

python3 - "$UUID" <<'PY'
import subprocess, ast, sys
uuid = sys.argv[1]
cur = subprocess.check_output(['gsettings', 'get', 'org.cinnamon', 'enabled-applets']).decode().strip()
if cur.startswith('@as '):
    cur = cur[4:]
lst = ast.literal_eval(cur)
# swap an early test version (window-opacity@chad) for this one, same panel spot
lst = [x.replace(':window-opacity@chad:', ':' + uuid + ':') for x in lst]
if any(':' + uuid + ':' in x for x in lst):
    print('Already on a panel.')
else:
    ids = [int(x.split(':')[-1]) for x in lst if x.split(':')[-1].isdigit()]
    lst.append('panel1:right:0:%s:%d' % (uuid, max(ids) + 1 if ids else 100))
    print('Added to panel 1 (usually the bottom bar), right side.')
subprocess.check_call(['gsettings', 'set', 'org.cinnamon', 'enabled-applets', str(lst)])
PY

rm -rf "$HOME/.local/share/cinnamon/applets/window-opacity@chad"

gdbus call --session --dest org.Cinnamon --object-path /org/Cinnamon \
  --method org.Cinnamon.ReloadXlet "$UUID" 'APPLET' >/dev/null 2>&1 || true

echo "Done. Look for the sun icon on your panel."
echo "If it doesn't show up, restart Cinnamon (Ctrl+Alt+Esc) or log out and back in."
