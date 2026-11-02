import {ok, near, done} from './harness.js';
import {FoldGeometry, Homography, frameParameters} from '../extension/lib/geometry.js';
import {PRESETS} from '../extension/lib/presets.js';

const W = 1920, H = 1200;
const g = new FoldGeometry(W, H, 92, {eyeDistance: 2.4, eyeHeight: 0, depth: 1});

// At the start angle the quad is the screen itself (no seam when the fold starts).
{
    const c = g.corners(92);
    near('bl x', c[0].x, 0, 1e-6); near('bl y', c[0].y, 0, 1e-6);
    near('br x', c[1].x, W, 1e-6); near('br y', c[1].y, 0, 1e-6);
    near('tr x', c[2].x, W, 1e-6); near('tr y', c[2].y, H, 1e-6);
    near('tl x', c[3].x, 0, 1e-6); near('tl y', c[3].y, H, 1e-6);
}
// Folding toward the eye: far edge climbs past the top, sides draw in, hinge edge stays put.
{
    const c = g.corners(70);
    const deep = g.corners(40);
    ok('far edge climbs past the glass top (40°)', deep[2].y > H && deep[3].y > H);
    ok('far edge sits near the top at 70°', c[2].y > 0.95 * H && c[2].y < 1.05 * H);
    ok('sides converge at the top', c[3].x > 0 && c[2].x < W);
    near('hinge corner stays at origin', c[0].y, 0, 1e-6);
    near('hinge corner x stays', c[0].x, 0, 1e-6);
    ok('symmetric about the centre', Math.abs((c[3].x + c[2].x) / 2 - W / 2) < 1e-6);
}
// depth 0 rides with the glass: no perspective at all.
{
    const g0 = new FoldGeometry(W, H, 92, {depth: 0});
    const c = g0.corners(60);
    near('depth 0: tl unchanged', c[3].y, H, 1e-6);
}
// Separation is soft-capped so the picture never goes behind the eye.
{
    const c = g.corners(0);
    ok('finite at fully closed', c.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
}
// Homography maps the rectangle onto the quad, and its inverse maps back.
{
    const quad = [{x: 10, y: 5}, {x: 1900, y: 3}, {x: 1700, y: 1400}, {x: 200, y: 1350}];
    const m = Homography.matrix(W, H, quad);
    const p = Homography.apply(m, {x: W, y: H});
    near('rect tr -> quad tr x', p.x, 1700, 1e-6); near('rect tr -> quad tr y', p.y, 1400, 1e-6);
    const inv = Homography.inverse(m);
    const q = Homography.apply(inv, {x: 200, y: 1350});
    near('inverse quad tl -> rect tl x', q.x, 0, 1e-6); near('inverse quad tl -> rect tl y', q.y, H, 1e-6);
    ok('column-major flat array of 9', Homography.flat(m).length === 9);
}
// frameParameters derives everything the shader needs for one frame.
{
    const p = frameParameters(PRESETS.duo, W, H, 92, {time: 0});
    near('at start: progress 0', p.progress, 0);
    near('at start: blurStrength 0', p.blurStrength, 0);
    near('at start: visibleTop 1', p.visibleTop, 1, 1e-6);
    near('at start: topEdge = H', p.topEdge, H, 1e-6);
    ok('inverse homography present', p.inverse.length === 9);
    const q = frameParameters(PRESETS.duo, W, H, 63, {time: 0});
    near('midway progress', q.progress, 0.5);
    ok('midway: visibleTop < 1', q.visibleTop < 1 && q.visibleTop >= 0.2);
    ok('midway: topEdge above the glass', q.topEdge > H);
    near('sheen position tracks progress', q.sheenPosition, 0.15 + 0.75 * 0.5);
    const r = frameParameters(PRESETS.duo, W, H, 10, {time: 0});
    ok('deep close raises blur floor', r.blurFloor > 0.5);
    const f = frameParameters(PRESETS.duo, W, H, 60, {time: 0, flat: true, progressOverride: 0.3});
    near('flat: progress override', f.progress, 0.3);
    near('flat: visibleTop 1', f.visibleTop, 1, 1e-6);
    // release factor scales the fold strength
    const s = frameParameters(PRESETS.duo, W, H, 63, {time: 0, strength: 0.5});
    near('strength scales blur', s.blurStrength, Math.pow(0.5, 1.55) * 0.5, 1e-9);
    near('strength scales dim', s.dimStrength, Math.pow(0.5, 0.75) * 0.5, 1e-9);
}
done();
