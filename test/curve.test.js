import {ok, near, done} from './harness.js';
import {FoldCurve} from '../extension/lib/curve.js';
import {PRESETS, DEFAULTS} from '../extension/lib/presets.js';

const c = new FoldCurve(92, 58);
near('progress 0 at start angle', c.progress(92), 0);
near('progress 0 above start', c.progress(120), 0);
near('progress 1 at start-span', c.progress(34), 1);
near('progress clamps below', c.progress(0), 1);
near('progress linear midway', c.progress(63), 0.5);
near('blur strength eases in', c.blurStrength(0.5), Math.pow(0.5, 1.55));
near('dim strength', c.dimStrength(0.5), Math.pow(0.5, 0.75));
ok('span floor of 1 avoids divide by zero', Number.isFinite(new FoldCurve(90, 0).progress(80)));

// presets match upstream values
ok('three presets', Object.keys(PRESETS).length === 3 && PRESETS.duo && PRESETS.soft && PRESETS.cinematic);
near('duo start 92', PRESETS.duo.startAngle, 92);
near('duo span 58', PRESETS.duo.span, 58);
near('duo blur 125', PRESETS.duo.blurRadius, 125);
near('soft start 90', PRESETS.soft.startAngle, 90);
near('soft eyeDistance 3.5', PRESETS.soft.eyeDistance, 3.5);
near('cinematic start 100', PRESETS.cinematic.startAngle, 100);
near('cinematic depth 1.2', PRESETS.cinematic.depth, 1.2);
ok('presets are frozen', Object.isFrozen(PRESETS.duo));
near('default rest delay 0.4s', DEFAULTS.restDelay, 0.4);
near('default fade out 0.35s', DEFAULTS.fadeOut, 0.35);
done();
