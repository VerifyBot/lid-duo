# Design

## The effect (ported from mac-duo, docs/EFFECT.md upstream)

Hinge along x, y up, z toward the person. A point at height h on a lid open to
angle θ (0 flat, 90 upright) sits at (x, h sinθ, h cosθ); the glass faces
(0, −cosθ, sinθ).

When the lid passes the start angle θ₀ the desktop is frozen as a plane at θ₀.
As the lid keeps turning to θ, each glass pixel shows what a fixed eye sees of
that frozen plane through the glass: project the four picture corners onto the
glass plane, fit a homography, and the shader uses its inverse per pixel.

Per pixel (one full-screen GLSL pass):
1. inverse homography → picture point; outside the padded picture = black
2. g = height above hinge / screen height (0 hinge, 1 far edge)
3. frost: radius = blurStrength · (floor + (1−floor)·g) · maxRadius; sampled
   from a mip pyramid with a 3×3 tent of trilinear taps
4. dim: spread = smoothstep(dimStart, dimReach, g);
   dim = dimStrength · (hingeFloor + (1−hingeFloor)·spread) · maxDim;
   colour *= (1−dim)^2.1
5. sheen: gaussian band across g, position runs with progress
6. grain: hash noise

progress = clamp((θ₀ − θ)/span); blurStrength = progress^1.55;
dimStrength = progress^0.75.

## Motion

Sensor is 10 Hz. A critically damped spring (ω = 14 rad/s) runs at frame rate
toward the latest sample. Direction/velocity from an angle tracker.

## Phases (decider): differs from upstream

Upstream keeps the fold up while the lid sits below θ₀. We add a rest rule:

- idle → active: lid closing and predicted angle ≤ baseline start angle.
- active: if the angle has not moved more than `restTolerance` (1°) for
  `restDelay` (default 2 s) and the lid is still open, go to `releasing`.
- releasing: progress fades to 0 over `fadeOut` (0.5 s); then idle with
  baseline = current angle (the fold re-arms from where the lid rests).
- active → idle also on opening past baseline + hysteresis (4°), as upstream.
- baseline resets to the preset start angle when the lid opens above it.

The frozen picture is retaken every time the fold starts.

## GNOME integration

- Extension `lid-duo@local`, GNOME Shell 48–50, Wayland.
- Angle: async read of `/sys/bus/iio/devices/iio:device*/` whose `name` is
  `hinge`, channel `in_angl0_raw` (degrees), polled every 100 ms with
  Gio.File.load_contents_async so the compositor thread never blocks.
- Freeze: `Shell.Screenshot.screenshot_stage_to_content()` → texture.
- Render: full-screen actor added with `addTopChrome`, a child actor holding
  the frozen picture, and a `Clutter.ShaderEffect` (fold.glsl) on the parent.
  The effect's offscreen texture is the picture; its mip chain (layer filter
  LINEAR_MIPMAP_LINEAR) is the blur pyramid, sampled with `textureLod`.
  Uniforms are set in `vfunc_paint_target` from `frameParameters()`. A frame
  timer (8 ms) drives `controller.tick()` only while a fold is on screen.
- Release fade: the overlay's opacity is the decider's release factor, so the
  live desktop shows through as the frost fades.
- Safety: never folds while `Main.sessionMode.isLocked`; login1
  `PrepareForSleep` and session lock abort any fold and drop the picture.
- Test hooks: D-Bus `org.gnome.Shell.Extensions.LidDuo` (Sweep, SetAngle,
  GetState, Shot) at `/org/gnome/Shell/Extensions/LidDuo`; see test/duoctl.
- Prefs: GSettings schema `org.gnome.shell.extensions.lid-duo`: preset,
  custom settings, restDelay, fadeOut, enabled.
- Panel indicator: toggle + preset switch + "test sweep" for development.
