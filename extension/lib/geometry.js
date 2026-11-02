// The physical model behind the Duo effect, ported from upstream
// FoldGeometry.swift / Homography.swift / FrameParameters.make.
//
// The desktop is frozen in the room when the fold starts. The lid keeps
// turning, and every glass pixel shows what a fixed eye would see of that
// frozen picture through the glass.
//
// World axes: hinge along x, y up, z toward the person. A point at height h on
// a lid open to angle θ (0 flat, 90 upright) sits at (x, h sinθ, h cosθ); the
// glass faces (0, −cosθ, sinθ). Screen points: origin bottom-left (hinge edge),
// y grows toward the top of the lid.
import {FoldCurve} from './curve.js';

const RAD = Math.PI / 180;

export class FoldGeometry {
    constructor(screenWidth, screenHeight, startAngle,
        {eyeDistance = 2.4, eyeHeight = 0, depth = 1, maximumSeparation = 88} = {}) {
        this.screenWidth = screenWidth;
        this.screenHeight = screenHeight;
        this.startAngle = startAngle;
        this.eyeDistance = eyeDistance;   // screen heights along the glass normal at the start
        this.eyeHeight = eyeHeight;       // screen heights above the screen centre
        this.depth = depth;               // 1 = picture fixed in the room, 0 = rides with the glass
        this.maximumSeparation = maximumSeparation;
    }

    // Where the picture's corners land on the glass at `angle`.
    // Order: bottom-left, bottom-right, top-right, top-left.
    corners(angle) {
        const travel = Math.max(this.startAngle - angle, 0);
        const separation = Math.min(this.depth * travel, this.maximumSeparation);
        const lid = angle * RAD;
        const pic = (angle + separation) * RAD;
        const start = this.startAngle * RAD;
        const width = this.screenWidth, height = this.screenHeight;

        const centre = {y: height / 2 * Math.sin(start), z: height / 2 * Math.cos(start)};
        const normal = {y: -Math.cos(start), z: Math.sin(start)};
        const up = {y: Math.sin(start), z: Math.cos(start)};
        const reach = this.eyeDistance * height;
        const lift = this.eyeHeight * height;
        const eye = {
            x: width / 2,
            y: centre.y + normal.y * reach + up.y * lift,
            z: centre.z + normal.z * reach + up.z * lift,
        };
        const n = {y: -Math.cos(lid), z: Math.sin(lid)};
        const nDotEye = n.y * eye.y + n.z * eye.z;

        const project = (px, ph) => {
            const q = {x: px, y: ph * Math.sin(pic), z: ph * Math.cos(pic)};
            const d = {x: q.x - eye.x, y: q.y - eye.y, z: q.z - eye.z};
            const nDotD = n.y * d.y + n.z * d.z;
            const t = Math.abs(nDotD) < 1e-9 ? 1 : Math.max(-nDotEye / nDotD, 1e-3);
            const hit = {x: eye.x + t * d.x, y: eye.y + t * d.y, z: eye.z + t * d.z};
            return {x: hit.x, y: hit.y * Math.sin(lid) + hit.z * Math.cos(lid)};
        };
        return [project(0, 0), project(width, 0), project(width, height), project(0, height)];
    }
}

// 3×3 matrices as three column arrays: m[col][row]. screen = M · (x, y, 1), then divide by z.
export const Homography = {
    // Maps (0,0)…(width,height) onto `corners` (bl, br, tr, tl). Heckbert's
    // square-to-quad, then the rectangle folded in.
    matrix(width, height, corners) {
        const [c0, c1, c2, c3] = corners;
        const dx1 = c1.x - c2.x, dx2 = c3.x - c2.x, dx3 = c0.x - c1.x + c2.x - c3.x;
        const dy1 = c1.y - c2.y, dy2 = c3.y - c2.y, dy3 = c0.y - c1.y + c2.y - c3.y;
        let g = 0, h = 0;
        if (Math.abs(dx3) > 1e-10 || Math.abs(dy3) > 1e-10) {
            const det = dx1 * dy2 - dx2 * dy1;
            if (Math.abs(det) > 1e-12) {
                g = (dx3 * dy2 - dx2 * dy3) / det;
                h = (dx1 * dy3 - dx3 * dy1) / det;
            }
        }
        const a = c1.x - c0.x + g * c1.x, b = c3.x - c0.x + h * c3.x, c = c0.x;
        const d = c1.y - c0.y + g * c1.y, e = c3.y - c0.y + h * c3.y, f = c0.y;
        return [
            [a / width, d / width, g / width],
            [b / height, e / height, h / height],
            [c, f, 1],
        ];
    },

    apply(m, p) {
        const x = m[0][0] * p.x + m[1][0] * p.y + m[2][0];
        const y = m[0][1] * p.x + m[1][1] * p.y + m[2][1];
        const z = m[0][2] * p.x + m[1][2] * p.y + m[2][2];
        return {x: x / z, y: y / z};
    },

    inverse(m) {
        const [[a, d, g], [b, e, h], [c, f, i]] = m;
        const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
        const D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
        const G = b * f - c * e, Hh = -(a * f - c * d), I = a * e - b * d;
        const det = a * A + b * B + c * C;
        const s = Math.abs(det) < 1e-18 ? 0 : 1 / det;
        // adjugate transposed back into column form
        return [
            [A * s, B * s, C * s],
            [D * s, E * s, F * s],
            [G * s, Hh * s, I * s],
        ];
    },

    // Column-major 9 floats, ready for a GLSL mat3.
    flat(m) { return [...m[0], ...m[1], ...m[2]]; },
};

// The whole look for one frame, derived from the settings and the lid.
// `strength` (0…1) is the decider's release factor; it scales the frost and
// dim so a rest fade runs the look down without touching the geometry.
export function frameParameters(effect, width, height, angle,
    {time = 0, flat = false, progressOverride = null, strength = 1} = {}) {
    const curve = new FoldCurve(effect.startAngle, effect.span);
    const progress = progressOverride ?? curve.progress(angle);
    let corners;
    if (flat) {
        corners = [{x: 0, y: 0}, {x: width, y: 0}, {x: width, y: height}, {x: 0, y: height}];
    } else {
        const geometry = new FoldGeometry(width, height, effect.startAngle,
            {eyeDistance: effect.eyeDistance, eyeHeight: effect.eyeHeight, depth: effect.depth});
        corners = geometry.corners(angle);
    }
    const inverse = Homography.inverse(Homography.matrix(width, height, corners));
    // How much of the picture the glass still shows at its top edge.
    const topCentre = Homography.apply(inverse, {x: width / 2, y: height});
    const visibleTop = Math.min(Math.max(topCentre.y / Math.max(height, 1), 0.2), 1);
    const envelope = 4 * progress * (1 - progress);
    // Deep into the close the picture is nearly edge-on and its hinge rows
    // stretch across the glass; frost them too so nothing streaks.
    const separation = flat ? 0 : Math.min(effect.depth * Math.max(effect.startAngle - angle, 0), 88);
    return {
        progress,
        corners,
        inverse: Homography.flat(inverse),
        blurStrength: curve.blurStrength(progress) * strength,
        dimStrength: curve.dimStrength(progress) * strength,
        blurFloor: Math.max(effect.blurFloor, FoldCurve.smoothstep((separation - 45) / 35)),
        maxDim: effect.dimming,
        dimStart: effect.dimStart,
        dimReach: effect.dimReach,
        dimHingeFloor: effect.dimHingeFloor,
        maxBlurRadius: effect.blurRadius,
        visibleTop,
        sheenAmount: effect.sheen * 0.16 * Math.pow(envelope, 1.5) * strength,
        sheenPosition: 0.15 + 0.75 * progress,
        grain: effect.grain,
        time: time % 1000,
        topEdge: flat ? height * 10 : corners[2].y,
        recede: 1,
    };
}
