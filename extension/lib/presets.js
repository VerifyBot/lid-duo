// Everything that shapes the look, ported verbatim from upstream mac-duo
// EffectSettings.swift. Presets are frozen; "custom" is any deviation.
const duo = Object.freeze({
    startAngle: 92,     // the fold starts here
    span: 58,           // degrees of further closing to full strength
    blurRadius: 125,    // px at the far edge at full strength
    blurFloor: 0.0,     // blur at the hinge as a fraction of the far edge
    dimming: 1,         // how dark the far edge goes
    dimStart: 0.0,      // height fraction where dimming starts to bite
    dimReach: 0.55,     // height fraction where dimming is full
    dimHingeFloor: 0.18,// dimming at the hinge as a fraction of the far edge
    eyeHeight: 0.0,     // eye above screen centre, in screen heights
    depth: 1,           // 1 = picture fixed in the room
    eyeDistance: 2.4,   // eye distance in screen heights
    sheen: 0,
    grain: 0,
});

const soft = Object.freeze({...duo,
    startAngle: 90, span: 50, blurRadius: 70, dimming: 0.7, dimReach: 0.75,
    dimHingeFloor: 0.1, depth: 0.8, eyeDistance: 3.5,
});

const cinematic = Object.freeze({...duo,
    startAngle: 100, span: 70, blurRadius: 160, dimming: 1, dimReach: 0.45,
    dimHingeFloor: 0.25, depth: 1.2, eyeDistance: 2.0,
});

export const PRESETS = Object.freeze({duo, soft, cinematic});

// Behaviour that is ours, not upstream's.
export const DEFAULTS = Object.freeze({
    restDelay: 0.4,     // s the lid must sit still before the fold lets go
    fadeOut: 0.35,      // s the frost takes to fade after a rest
    restTolerance: 1,   // degrees of jitter that still count as "still"
    hysteresis: 4,      // degrees above the baseline the lid must open to release
    armCeiling: 70,     // degrees above the start where warming up begins
    closingMemory: 1.5, // s after the last closing movement the fold may still start
    minimumDuration: 0.35,
});
