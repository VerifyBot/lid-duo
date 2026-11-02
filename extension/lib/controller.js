// Ties the angle stream to the overlay. Pure: no GNOME imports, so the whole
// fold lifecycle is testable with a fake overlay and a fake clock.
//
// overlay contract: {width, height, begin(), show(), hide(), render(params, strength)}
import {AngleTracker} from './tracker.js';
import {FoldDecider} from './decider.js';
import {DampedSpring} from './spring.js';
import {frameParameters} from './geometry.js';
import {DEFAULTS} from './presets.js';

export class FoldController {
    constructor(overlay, opts) {
        this.overlay = overlay;
        this.opts = {...DEFAULTS, ...opts};
        this.effect = this.opts.effect;
        this.locked = false;
        this.enabled = true;
        this.tracker = new AngleTracker({tolerance: this.opts.restTolerance});
        this.decider = new FoldDecider({...this.opts, startAngle: this.effect.startAngle});
        this.spring = new DampedSpring(this.effect.startAngle, 14);
        this._shown = false;
        this._lastPhase = 'idle';
        this._lastTick = null;
        this._sweep = null;
        this.phase = 'idle';
    }

    setEffect(effect) {
        this.effect = effect;
        this.decider = new FoldDecider({...this.opts, startAngle: effect.startAngle});
    }

    setOptions(opts) {
        this.opts = {...this.opts, ...opts};
        this.tracker.tolerance = this.opts.restTolerance;
        this.decider = new FoldDecider({...this.opts, startAngle: this.effect.startAngle});
    }

    setEnabled(on) { this.enabled = on; }

    // Drop the fold at once (sleep, lock, disable). The next close starts fresh.
    abort() {
        this._sweep = null;
        this.decider.forceIdle();
        if (this._shown) { this.overlay.hide(); this._shown = false; }
        this._lastPhase = 'idle';
        this.phase = 'idle';
    }

    // One sensor reading. Ignored while a scripted sweep owns the angle.
    sample(angle, time) {
        if (this._sweep) return;
        this.tracker.push(angle, time);
    }

    // Scripted close-and-open, for testing without a lid: `duration` seconds
    // down from 110° to 20°, then the same back up.
    sweep(duration, startTime, {from = 110, to = 20} = {}) {
        this._sweep = {duration, startTime, from, to};
    }

    _sweepAngle(time) {
        const s = this._sweep;
        const t = (time - s.startTime) / s.duration;
        if (t >= 2) { this._sweep = null; return s.from; }
        const k = t < 1 ? t : 2 - t;
        return s.from + (s.to - s.from) * k;
    }

    // One frame. Returns the phase after it.
    tick(time) {
        if (this._sweep) this.tracker.push(this._sweepAngle(time), time);
        const dt = this._lastTick === null ? 1 / 60 : time - this._lastTick;
        this._lastTick = time;

        this.decider.enabled = this.enabled && !this.locked;
        const phase = this.decider.update(this.tracker, time);

        if (phase === 'active' && this._lastPhase !== 'active' && this._lastPhase !== 'releasing') {
            // The fold starts at the baseline, so the first frame is seamless.
            this.spring.snap(this.decider.baseline);
            this.overlay.begin();
            this.overlay.show();
            this._shown = true;
        }

        if (phase === 'active' || phase === 'releasing') {
            this.spring.advance(this.tracker.smoothTarget(time), dt);
            const effect = {...this.effect, startAngle: this.decider.baseline};
            const params = frameParameters(effect, this.overlay.width, this.overlay.height,
                this.spring.value, {time});
            this.overlay.render(params, this.decider.releaseFactor(time));
        } else if (this._shown) {
            this.overlay.hide();
            this._shown = false;
        }
        this._lastPhase = phase;
        this.phase = phase;
        return phase;
    }
}
