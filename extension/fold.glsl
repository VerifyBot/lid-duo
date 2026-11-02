// The fold, in one full-screen pass (port of upstream DuoShaders.swift to
// Clutter.ShaderEffect GLSL). Every glass pixel maps back into the frozen
// picture through the inverse perspective; frost, dimming, sheen and grain
// follow the picture's own height above the hinge.
//
// Instead of a padded texture we clamp to the picture's edge and fade the
// leaked light with distance, which reads the same and needs no margin.
//
// All lookups use textureLod (explicit level). Implicit-derivative lookups
// after the early returns below pick garbage levels on Mesa/Intel and come
// out dark. Needs GLSL >= 1.30, which Cogl's GL3 driver provides (#version 140).
uniform sampler2D tex;
uniform float h0, h1, h2, h3, h4, h5, h6, h7, h8; // inverse homography, column-major
uniform float width, height;    // screen size, logical px (the homography's units)
uniform float texW, texH;       // texture size in texels
uniform float maxRadius;        // blur radius at full strength, logical px
uniform float blurStrength, blurFloor, maxDim, maxLevel;
uniform float dimStart, dimStrength, dimReach, dimHinge;
uniform float sheenAmount, sheenPos, grain, time, topEdge, recede;
uniform float strength;         // 0..1, how much of the fold to show (release fade)

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 tap(vec2 uv, float lod) {
    return textureLod(tex, uv, lod).rgb;
}

void main() {
    vec2 uv = cogl_tex_coord_in[0].xy;
    vec4 live = textureLod(tex, uv, 0.0);
    if (strength <= 0.001) { cogl_color_out = live; return; }
    // Geometry is in points with y up and the hinge at y = 0.
    vec2 screenPoint = vec2(uv.x * width, (1.0 - uv.y) * height);
    // Above the picture's far edge the glass carries the edge's own light,
    // fading in screen space. Rows above the edge sample the edge itself.
    float above = max(screenPoint.y - (topEdge - 2.0), 0.0);
    screenPoint.y = min(screenPoint.y, topEdge - 2.0);

    mat3 toPicture = mat3(h0, h1, h2, h3, h4, h5, h6, h7, h8);
    vec3 mapped = toPicture * vec3(screenPoint, 1.0);
    if (abs(mapped.z) < 1e-6 || mapped.z < 0.0) {
        cogl_color_out = mix(live, vec4(0.0, 0.0, 0.0, 1.0), strength);
        return;
    }
    vec2 picturePoint = mapped.xy / mapped.z;
    vec2 clampedPoint = clamp(picturePoint, vec2(0.0), vec2(width, height));
    float outside = length(picturePoint - clampedPoint);
    float leak = exp(-pow(outside / max(0.12 * height, 1.0), 1.3));
    vec2 texCoord = vec2(clampedPoint.x / width, 1.0 - clampedPoint.y / height);

    // Height above the hinge: 0 at the hinge, 1 at the far edge.
    float g = clamp(clampedPoint.y / height, 0.0, 1.0);

    // Frost. The far edge dissolves first; the hinge stays readable. Past the
    // picture's edge the radius has a floor so the leak is soft.
    float blur = blurStrength * (blurFloor + (1.0 - blurFloor) * g);
    if (outside > 0.0) blur = max(blur, 0.35 * blurStrength);
    float radius = blur * maxRadius * (texW / width);   // texels
    float mip = clamp(log2(max(radius, 1.0)), 0.0, maxLevel);

    vec3 colour;
    if (radius < 0.75) {
        colour = tap(texCoord, 0.0);
    } else {
        // A 3x3 tent of trilinear taps hides the pyramid's steps.
        vec2 stride = vec2(1.0 / texW, 1.0 / texH) * radius * 0.45;
        colour  = tap(texCoord + vec2(-1.0, -1.0) * stride, mip) * (1.0 / 16.0);
        colour += tap(texCoord + vec2( 0.0, -1.0) * stride, mip) * (2.0 / 16.0);
        colour += tap(texCoord + vec2( 1.0, -1.0) * stride, mip) * (1.0 / 16.0);
        colour += tap(texCoord + vec2(-1.0,  0.0) * stride, mip) * (2.0 / 16.0);
        colour += tap(texCoord,                              mip) * (4.0 / 16.0);
        colour += tap(texCoord + vec2( 1.0,  0.0) * stride, mip) * (2.0 / 16.0);
        colour += tap(texCoord + vec2(-1.0,  1.0) * stride, mip) * (1.0 / 16.0);
        colour += tap(texCoord + vec2( 0.0,  1.0) * stride, mip) * (2.0 / 16.0);
        colour += tap(texCoord + vec2( 1.0,  1.0) * stride, mip) * (1.0 / 16.0);
    }
    // Upstream works in linear light (sRGB texture); ours is gamma-encoded.
    colour = pow(max(colour, 0.0), vec3(2.2));
    colour *= leak;

    // Dimming, so the far edge fades into the dark rather than going grey.
    float spread = smoothstep(dimStart, max(dimReach, dimStart + 0.05), g);
    float dim = dimStrength * (dimHinge + (1.0 - dimHinge) * spread) * maxDim;
    colour *= pow(1.0 - dim, 2.1) * recede;
    colour *= exp(-pow(above / max(0.22 * height, 1.0), 1.4));

    // Sheen: a soft band of light crossing the frost, tinted by the picture's
    // own average colour (the top of the pyramid).
    if (sheenAmount > 0.0005) {
        float band = exp(-pow((g - sheenPos) / 0.22, 2.0));
        vec3 average = tap(vec2(0.5, 0.5), maxLevel);
        vec3 tint = 0.55 + 0.45 * average;
        colour += sheenAmount * band * tint * (1.0 - 0.5 * dim) * recede;
    }

    // Grain, so a dark gradient does not band.
    float noise = hash(gl_FragCoord.xy + fract(time) * 17.0) - 0.5;
    colour += noise * grain * (2.5 / 255.0);

    colour = pow(max(colour, 0.0), vec3(1.0 / 2.2));
    cogl_color_out = mix(live, vec4(colour, 1.0), strength);
}
