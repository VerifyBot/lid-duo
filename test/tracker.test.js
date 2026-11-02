import {ok, near, done} from './harness.js';
import {AngleTracker} from '../extension/lib/tracker.js';

// samples: (angle, time)
{
    const t = new AngleTracker();
    t.push(100, 0); t.push(95, 0.1); t.push(90, 0.2);
    near('angle is latest', t.angle, 90);
    ok('closing', t.isClosing(0.2, 1.5));
    near('velocity deg/s', t.velocity, -50, 1);
    { const p = t.predictedAngle(0.25); ok('predicts ahead of the reading', p < 90 && p > 84); }
}
{
    const t = new AngleTracker();
    t.push(90, 0); t.push(95, 0.1);
    ok('opening is not closing', !t.isClosing(0.1, 1.5));
    ok('isOpening', t.isOpening(0.1, 1.5));
}
{
    const t = new AngleTracker();
    t.push(90, 0); t.push(85, 0.1);
    ok('closing memory expires', !t.isClosing(5, 1.5));
    ok('prediction is clamped to a sane horizon', t.predictedAngle(50) > 0);
}
{
    const t = new AngleTracker();
    t.push(90, 0); t.push(90, 0.1); t.push(90, 5);
    near('still: velocity zero', t.velocity, 0);
    near('still: predicted equals angle', t.predictedAngle(5.1), 90);
    near('time since last movement', t.stillFor(5), 5, 1e-9);
}
{
    const t = new AngleTracker({tolerance: 1});
    t.push(90, 0); t.push(90.4, 1); t.push(89.7, 2);
    near('jitter within tolerance counts as still', t.stillFor(2), 2, 1e-9);
    t.push(85, 3);
    near('real move resets stillness', t.stillFor(3), 0, 1e-9);
}
// two readings 1 ms apart must not produce a physically absurd velocity
{
    const t = new AngleTracker();
    t.push(110, 0); t.push(50, 0.002);
    ok('velocity is clamped to a physical maximum', Math.abs(t.velocity) <= 720);
    ok('extrapolation stays near the reading', Math.abs(t.extrapolatedAngle(0.1) - 50) < 100);
}
// jitter at rest must not move the smoothed target at all
{
    const t = new AngleTracker({tolerance: 1});
    t.push(80, 0); t.push(80, 0.04); t.push(81, 0.08); t.push(80, 0.12); t.push(81, 0.16); t.push(80, 0.2);
    near('rest target is the anchor despite +-1 jitter', t.smoothTarget(0.2), 80, 1e-9);
    near('rest target between polls stays put', t.smoothTarget(0.25), 80, 1e-9);
}
// a real move extrapolates while moving and stops dead when readings stop changing
{
    const t = new AngleTracker({tolerance: 1});
    t.push(90, 0); t.push(90, 0.04); t.push(85, 0.1); t.push(85, 0.14); t.push(80, 0.2);
    ok('moving: target runs ahead of the reading', t.smoothTarget(0.25) < 80);
    t.push(80, 0.24); t.push(80, 0.28); t.push(80, 0.32); t.push(80, 0.36); t.push(80, 0.4);
    near('stopped: target is exactly the reading', t.smoothTarget(0.4), 80, 1e-9);
    near('stopped: velocity zeroed quickly', t.velocity, 0);
}
// velocity uses the sensor's own update interval, not the poll interval
{
    const t = new AngleTracker({tolerance: 1});
    t.push(90, 0); t.push(90, 0.04); t.push(90, 0.08); t.push(85, 0.1);
    ok('velocity ~ -50 deg/s from a 5 deg step over 0.1 s', t.velocity < -30 && t.velocity > -80);
}
// once settled, the dead zone widens: +-3 wobble does not move the anchor or the target
{
    const t = new AngleTracker({tolerance: 1, settledTolerance: 4, settleTime: 1.5});
    t.push(60, 0); for (let i = 1; i <= 20; i++) t.push(60, i * 0.1);   // 2 s still
    ok('settled after settleTime', t.isSettled(2.0));
    t.push(63, 2.1); t.push(58, 2.2); t.push(62, 2.3);
    near('settled: anchor holds through +-3', t.smoothTarget(2.3), 60, 1e-9);
    ok('settled: still counts as still', t.stillFor(2.3) > 2);
    t.push(55, 2.4);
    ok('settled: a 5 deg push moves it', t.smoothTarget(2.45) < 58);
    ok('moving again: no longer settled', !t.isSettled(2.45));
}
// before settling the dead zone is the tight one, so a slow close is tracked
{
    const t = new AngleTracker({tolerance: 1, settledTolerance: 4, settleTime: 1.5});
    t.push(90, 0); t.push(88, 0.1); t.push(86, 0.2);
    near('not settled: 2 deg steps move the anchor', t.smoothTarget(0.2) > 85 && t.smoothTarget(0.2) <= 86 ? 1 : 0, 1);
}
done();
