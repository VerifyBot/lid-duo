#!/usr/bin/env bash
# Launch a nested GNOME Shell with only lid-duo enabled, in a throwaway config
# so the real session is untouched. Prints the nested session bus address so
# test/duoctl can talk to the extension.
set -u
UUID="lid-duo@local"
LOG="${1:-${TMPDIR:-/tmp}/lid-duo-nested.log}"
CFG="$(mktemp -d)"
BUSFILE="${TMPDIR:-/tmp}/lid-duo-nested.bus"
rm -f "$LOG" "$BUSFILE"
XDG_CONFIG_HOME="$CFG" dbus-run-session -- bash --noprofile --norc -c "
  echo \"\$DBUS_SESSION_BUS_ADDRESS\" > '$BUSFILE'
  gsettings set org.gnome.shell disable-user-extensions false
  gsettings set org.gnome.shell enabled-extensions \"['$UUID']\"
  exec env ${COGL_DEBUG:+COGL_DEBUG=$COGL_DEBUG} gnome-shell --devkit --wayland
" >"$LOG" 2>&1 &
echo "nested_pid=$!"
echo "log=$LOG"
echo "bus_file=$BUSFILE"
