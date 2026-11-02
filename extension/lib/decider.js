// The rules for when the fold is on screen. Pure, so it can be tested
// without a lid.
//
// Phases: idle -> armed (lid coming down toward the baseline) -> active (fold
// on screen) -> releasing (lid rested; frost fading out) -> idle with the
// baseline moved to where the lid rests, so the next close re-arms from there.
import {DEFAULTS} from './presets.js';

export class FoldDecider {
    constructor(opts = {}) {
        const o = {...DEFAULTS, ...opts};
        this.startAngle = o.startAngle;      // the preset's start angle
        this.hysteresis = o.hysteresis;
        this.armCeiling = o.armCeiling;
        this.closingMemory = o.closingMemory;
        this.minimumDuration = o.minimumDuration;
        this.restDelay = o.restDelay;
        this.fadeOut = o.fadeOut;
        this.enabled = true;
        this.phase = 'idle';
        this.baseline = o.startAngle;        // where the current/next fold starts
        this.activatedAt = -Infinity;
        this.releasedAt = -Infinity;
    }

    update(tracker, time) {
        if (!this.enabled) { this.phase = 'idle'; return this.phase; }
        const angle = tracker.angle;
        switch (this.phase) {
        case 'active':
            if (time - this.activatedAt < this.minimumDuration) break;
            if (angle >= this.baseline + this.hysteresis) {
                this.phase = 'idle';
                this._followOpening(angle);
            } else if (tracker.stillFor(time) >= this.restDelay) {
                this.phase = 'releasing';
                this.releasedAt = time;
            }
            break;
        case 'releasing':
            if (time - this.releasedAt >= this.fadeOut) {
                this.phase = 'idle';
                this.baseline = Math.min(angle, this.startAngle);
            }
            break;
        default: { // idle, armed
            this._followOpening(angle);
            const closing = tracker.isClosing(time, this.closingMemory);
            // A fold needs a deliberate move: either the lid is clearly moving
            // now (sensor jitter is ~10°/s), or it has crept well past the
            // baseline (a slow, steady close).
            // Both must hold: the anchor moved just now (so wobble inside the
            // dead zone never counts) and the reading is past the baseline.
            const anchorMoved = tracker.stillFor(time) < 0.3;
            const deliberate = anchorMoved && (tracker.velocity <= -tracker.moveSpeed || tracker.anchor <= this.baseline - 2);
            if (closing && deliberate && tracker.predictedAngle(time) <= this.baseline) {
                this.phase = 'active';
                this.activatedAt = time;
            } else if (closing && angle <= this.baseline + this.armCeiling) {
                this.phase = 'armed';
            } else {
                this.phase = 'idle';
            }
        }
        }
        return this.phase;
    }

    // While the lid is not folding, the baseline rides up with it (never past
    // the preset start), so a close from any rest angle starts seamlessly.
    _followOpening(angle) {
        this.baseline = Math.min(this.startAngle, Math.max(this.baseline, angle));
    }

    // 1 while the fold is fully owned by the angle, sliding to 0 through the
    // release fade, 0 when idle. The renderer multiplies progress by this.
    releaseFactor(time) {
        if (this.phase === 'active') return 1;
        if (this.phase === 'releasing')
            return Math.min(Math.max(1 - (time - this.releasedAt) / this.fadeOut, 0), 1);
        return 0;
    }

    forceIdle() { this.phase = 'idle'; }
    forceActive(time) { this.phase = 'active'; this.activatedAt = time; }
}
