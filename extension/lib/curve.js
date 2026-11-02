// How far along the fold we are at a lid angle, and how strong each part of
// the look is there. Everything is a function of the angle, so opening runs
// it backwards.
export class FoldCurve {
    constructor(startAngle, span, {blurExponent = 1.55, dimExponent = 0.75} = {}) {
        this.startAngle = startAngle;
        this.span = Math.max(span, 1);
        this.blurExponent = blurExponent;
        this.dimExponent = dimExponent;
    }

    // 0 at the start angle, 1 at full strength, linear in the angle.
    progress(angle) {
        const raw = (this.startAngle - angle) / this.span;
        return Math.min(Math.max(raw, 0), 1);
    }

    blurStrength(progress) {
        return Math.pow(Math.min(Math.max(progress, 0), 1), this.blurExponent);
    }

    dimStrength(progress) {
        return Math.pow(Math.min(Math.max(progress, 0), 1), this.dimExponent);
    }

    static smoothstep(t) {
        const x = Math.min(Math.max(t, 0), 1);
        return x * x * (3 - 2 * x);
    }
}
