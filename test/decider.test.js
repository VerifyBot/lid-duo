import {ok, near, done} from './harness.js';
import {AngleTracker} from '../extension/lib/tracker.js';
import {FoldDecider} from '../extension/lib/decider.js';

function drive(d, t, samples) {
    let phase;
    for (const [a, time] of samples) { t.push(a, time); phase = d.update(t, time); }
    return phase;
}
const opts = {startAngle: 92, restDelay: 2, fadeOut: 0.5, restTolerance: 1};

// idle -> active when closing through the start angle
{
    const d = new FoldDecider(opts), t = new AngleTracker();
    ok('open lid is idle', drive(d, t, [[110, 0], [110, 0.1]]) === 'idle');
    ok('closing but still above start: armed', drive(d, t, [[100, 0.2]]) === 'armed');
    ok('crossing start activates', drive(d, t, [[91, 0.3]]) === 'active');
    near('baseline is the preset start', d.baseline, 92);
    ok('keeps active while moving', drive(d, t, [[80, 0.4], [70, 0.5]]) === 'active');
}
// sitting still below the start angle releases after restDelay, fades, then idles with new baseline
{
    const d = new FoldDecider(opts), t = new AngleTracker();
    drive(d, t, [[110, 0], [100, 0.1], [91, 0.2], [75, 0.3]]);
    ok('still 1s: active', drive(d, t, [[75, 1.3]]) === 'active');
    ok('still 2.3s: releasing', drive(d, t, [[75, 2.6]]) === 'releasing');
    near('release strength just after release ~1', d.releaseFactor(2.61), 1, 0.05);
    near('release strength mid-fade', d.releaseFactor(2.85), 0.5, 0.05);
    ok('after fadeOut: idle', drive(d, t, [[75, 3.2]]) === 'idle');
    near('baseline moved to rest angle', d.baseline, 75);
    near('release strength when idle is 0', d.releaseFactor(3.2), 0);
}
// re-arms from the new baseline: closing further starts a new fold at 75
{
    const d = new FoldDecider(opts), t = new AngleTracker();
    drive(d, t, [[110, 0], [100, 0.1], [91, 0.2], [75, 0.3], [75, 2.6], [75, 3.2]]);
    ok('idle at rest', d.phase === 'idle');
    ok('closing again from 75 activates', drive(d, t, [[72, 3.3], [69, 3.4]]) === 'active');
    near('baseline still 75', d.baseline, 75);
}
// a continuous close never rests, so it stays active all the way down
{
    const d = new FoldDecider(opts), t = new AngleTracker();
    const s = []; for (let i = 0; i <= 30; i++) s.push([110 - i * 3.5, i * 0.1]);
    ok('continuous close stays active', drive(d, t, s) === 'active');
}
// opening past baseline + hysteresis returns to idle immediately (fold runs back via progress)
{
    const d = new FoldDecider(opts), t = new AngleTracker();
    drive(d, t, [[110, 0], [100, 0.1], [91, 0.2], [80, 0.3]]);
    ok('opening to 95: still active (hysteresis)', drive(d, t, [[95, 0.9]]) === 'active');
    ok('opening to 97: idle', drive(d, t, [[97, 1.0]]) === 'idle');
    near('baseline reset to preset when opened above it', d.baseline, 92);
}
// opening above a rested baseline resets baseline to the preset start
{
    const d = new FoldDecider(opts), t = new AngleTracker();
    drive(d, t, [[110, 0], [100, 0.1], [91, 0.2], [75, 0.3], [75, 2.6], [75, 3.2]]);
    drive(d, t, [[85, 3.4], [95, 3.5], [100, 3.6]]);
    near('baseline back to 92 after opening past it', d.baseline, 92);
}
// minimum duration: a fold that just started is not released by the hysteresis check
{
    const d = new FoldDecider(opts), t = new AngleTracker();
    drive(d, t, [[110, 0], [100, 0.1], [91, 0.2]]);
    ok('active', d.phase === 'active');
    ok('bounce above start within 0.35s stays active', drive(d, t, [[97, 0.3]]) === 'active');
}
// disabled forces idle
{
    const d = new FoldDecider(opts), t = new AngleTracker();
    drive(d, t, [[110, 0], [100, 0.1], [91, 0.2]]);
    d.enabled = false;
    ok('disabled -> idle', drive(d, t, [[80, 0.3]]) === 'idle');
}
// after a rest release, +-1 jitter must not restart the fold; a real close must
{
    const d = new FoldDecider({...opts, restDelay: 0.4, fadeOut: 0.35}), t = new AngleTracker({tolerance: 1});
    drive(d, t, [[110, 0], [100, 0.1], [91, 0.2], [80, 0.3], [70, 0.4]]);
    let s = []; for (let i = 1; i <= 12; i++) s.push([70 + (i % 2), 0.4 + i * 0.1]);
    drive(d, t, s);
    ok('jitter at rest ends with no fold on screen', d.phase === 'idle' || d.phase === 'armed');
    let again = []; for (let i = 13; i <= 24; i++) again.push([70 + (i % 2), 0.4 + i * 0.1]);
    const phases = new Set(); for (const [a, time] of again) { t.push(a, time); phases.add(d.update(t, time)); }
    ok('jitter never re-activates', !phases.has('active'));
    ok('a real close from rest activates', drive(d, t, [[67, 3.0], [63, 3.1], [59, 3.2]]) === 'active');
}
// settled at 60: +-3 wobble never activates; a real close does
{
    const d = new FoldDecider({...opts, restDelay: 0.4, fadeOut: 0.35}), t = new AngleTracker({tolerance: 1, settledTolerance: 4, settleTime: 1.5});
    drive(d, t, [[110, 0], [100, 0.1], [91, 0.2], [80, 0.3], [70, 0.4], [60, 0.5]]);
    let s = []; for (let i = 1; i <= 25; i++) s.push([60, 0.5 + i * 0.1]);
    drive(d, t, s);
    ok('rested at 60: no fold', d.phase !== 'active' && d.phase !== 'releasing');
    const phases = new Set();
    for (const [a, time] of [[63, 3.1], [58, 3.2], [62, 3.3], [57, 3.4], [61, 3.5], [58, 3.6]]) { t.push(a, time); phases.add(d.update(t, time)); }
    ok('settled wobble +-3 never activates', !phases.has('active'));
    ok('real close from settled activates', drive(d, t, [[54, 3.7], [49, 3.8]]) === 'active');
}
done();
