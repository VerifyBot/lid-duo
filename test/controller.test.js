import {ok, near, done} from './harness.js';
import {FoldController} from '../extension/lib/controller.js';
import {PRESETS, DEFAULTS} from '../extension/lib/presets.js';

// A fake overlay records what the controller asks of it.
function fakeOverlay() {
    return {
        begun: 0, shown: false, frames: [], width: 1920, height: 1200,
        begin() { this.begun++; },
        show() { this.shown = true; },
        hide() { this.shown = false; },
        render(params, strength) { this.frames.push({params, strength}); },
    };
}
const mk = (opts = {}) => {
    const ov = fakeOverlay();
    const c = new FoldController(ov, {effect: PRESETS.duo, ...DEFAULTS, ...opts});
    return [c, ov];
};
const closeTo = (c, angle, t) => { c.sample(angle, t); c.tick(t); };

// A close through the start angle freezes the picture once and shows the overlay.
{
    const [c, ov] = mk();
    closeTo(c, 110, 0); closeTo(c, 100, 0.1);
    ok('armed: not shown yet', !ov.shown);
    closeTo(c, 91, 0.2); closeTo(c, 85, 0.3);
    ok('active: overlay shown', ov.shown);
    ok('fold begun exactly once', ov.begun === 1);
    ok('frames rendered with full strength', ov.frames.length > 0 && ov.frames.at(-1).strength === 1);
    ok('rendered progress > 0', ov.frames.at(-1).params.progress > 0);
}
// Frames between sensor samples keep moving (spring at frame rate).
{
    const [c, ov] = mk();
    closeTo(c, 110, 0); closeTo(c, 100, 0.1); closeTo(c, 91, 0.2); closeTo(c, 70, 0.3);
    const p0 = ov.frames.at(-1).params.progress;
    c.tick(0.316); const p1 = ov.frames.at(-1).params.progress;
    c.tick(0.333); const p2 = ov.frames.at(-1).params.progress;
    ok('progress advances between samples', p1 > p0 && p2 > p1);
}
// Resting releases: strength fades to 0, then the overlay hides and the picture is dropped.
{
    const [c, ov] = mk({restDelay: 2, fadeOut: 0.5});
    closeTo(c, 110, 0); closeTo(c, 100, 0.1); closeTo(c, 91, 0.2); closeTo(c, 75, 0.3);
    for (let t = 0.4; t <= 2.5; t += 0.1) closeTo(c, 75, t);
    ok('releasing: still shown', ov.shown);
    const s = ov.frames.at(-1).strength;
    ok('strength is fading', s < 1 && s > 0);
    for (let t = 2.6; t <= 3.3; t += 0.1) closeTo(c, 75, t);
    ok('after fade: hidden', !ov.shown);
    // and a further close re-freezes from the new baseline
    closeTo(c, 72, 3.4); closeTo(c, 68, 3.5);
    ok('re-armed close begins a new fold', ov.begun === 2 && ov.shown);
}
// Opening back above the start hides the overlay.
{
    const [c, ov] = mk();
    closeTo(c, 110, 0); closeTo(c, 100, 0.1); closeTo(c, 91, 0.2); closeTo(c, 80, 0.3);
    closeTo(c, 90, 0.8); closeTo(c, 98, 0.9);
    ok('opened past start: hidden', !ov.shown);
}
// Locked session: never activates, and locking mid-fold drops everything.
{
    const [c, ov] = mk();
    c.locked = true;
    closeTo(c, 110, 0); closeTo(c, 100, 0.1); closeTo(c, 91, 0.2); closeTo(c, 80, 0.3);
    ok('locked: never shown', !ov.shown && ov.begun === 0);
    c.locked = false;
    closeTo(c, 100, 1.0); closeTo(c, 110, 1.1); closeTo(c, 100, 1.2); closeTo(c, 91, 1.3); closeTo(c, 80, 1.4);
    ok('unlocked: folds again', ov.shown);
    c.locked = true; c.tick(1.5);
    ok('lock mid-fold hides', !ov.shown);
}
// Scripted sweep drives the fold without a sensor.
{
    const [c, ov] = mk();
    c.sweep(1.0, 0);          // 1 s down, 1 s up, starting at t=0
    for (let t = 0; t <= 2.2; t += 1 / 60) c.tick(t);
    ok('sweep began', ov.begun === 1);
    ok('sweep ended hidden', !ov.shown);
    const maxP = Math.max(...ov.frames.map(f => f.params.progress));
    ok('sweep reached full fold', maxP > 0.95);
}
// Disabling hides immediately.
{
    const [c, ov] = mk();
    closeTo(c, 110, 0); closeTo(c, 100, 0.1); closeTo(c, 91, 0.2); closeTo(c, 80, 0.3);
    c.setEnabled(false); c.tick(0.4);
    ok('disabled: hidden', !ov.shown);
}
// abort (sleep, lock, disable) drops the fold at once and needs a fresh close to start again.
{
    const [c, ov] = mk();
    closeTo(c, 110, 0); closeTo(c, 100, 0.1); closeTo(c, 91, 0.2); closeTo(c, 80, 0.3);
    c.abort();
    ok('abort hides immediately', !ov.shown && c.phase === 'idle');
    closeTo(c, 78, 0.4); closeTo(c, 74, 0.5);
    ok('a continuing close after abort begins a fresh fold', ov.begun === 2 && ov.shown);
}
done();
