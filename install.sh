#!/usr/bin/env bash
# Symlink the extension into the user's extensions dir and compile its schema.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dest="$HOME/.local/share/gnome-shell/extensions/lid-duo@local"
glib-compile-schemas "$here/extension/schemas/"
if [ -e "$dest" ] && [ ! -L "$dest" ]; then echo "$dest exists and is not a symlink; refusing" >&2; exit 1; fi
ln -sfn "$here/extension" "$dest"
echo "linked $dest -> $here/extension"
echo "On Wayland, log out and back in once, then: gnome-extensions enable lid-duo@local"
