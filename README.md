# lid-duo

Mac Duo for GNOME on Linux: as you close the laptop lid, the desktop freezes
in place and a frosted-glass fold sweeps over it, driven live by the hinge
angle sensor. Opening the lid plays it back.

Port of the effect from https://github.com/ninobc/mac-duo (mac-duo.com) to a
GNOME Shell 50 / Wayland extension. Needs a laptop whose hinge angle is
exposed as an IIO `hinge` device (Intel ISH, e.g. ThinkPad X1 2-in-1).

See docs/DESIGN.md for how it works.
