// Tiny assertion helper for gjs tests.
let pass = 0, fail = 0;
export function ok(name, cond) {
    if (cond) { pass++; print('  PASS: ' + name); }
    else { fail++; print('  FAIL: ' + name); }
}
export function near(name, a, b, eps = 1e-6) {
    ok(`${name} (${a} ~ ${b})`, Math.abs(a - b) <= eps);
}
export function done() {
    print(`  ${pass} passed, ${fail} failed`);
    if (fail) imports.system.exit(1);
}
