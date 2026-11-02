#!/usr/bin/env gjs -m
import {ok, near, done} from './harness.js';
import {DampedSpring} from '../extension/lib/spring.js';

// Follows a step target without overshoot and settles.
{
    const s = new DampedSpring(0, 14);
    let maxV = -Infinity;
    for (let i = 0; i < 120; i++) { s.advance(10, 1 / 60); maxV = Math.max(maxV, s.value); }
    ok('reaches target after 2 s', Math.abs(s.value - 10) < 0.05);
    ok('never overshoots', maxV <= 10 + 1e-9);
    ok('reports settled', s.isSettled(10));
}
// Moves toward target in first frame, but not all the way.
{
    const s = new DampedSpring(0, 14);
    s.advance(10, 1 / 60);
    ok('moves in first frame', s.value > 0);
    ok('does not jump', s.value < 10);
}
// dt is clamped so a long stall cannot blow up.
{
    const s = new DampedSpring(0, 14);
    s.advance(10, 5);
    ok('large dt stays finite and bounded', Number.isFinite(s.value) && s.value <= 10);
}
// snap sets value and kills velocity.
{
    const s = new DampedSpring(0, 14);
    s.advance(10, 1 / 60);
    s.snap(3);
    near('snap value', s.value, 3);
    near('snap velocity', s.velocity, 0);
}
done();
