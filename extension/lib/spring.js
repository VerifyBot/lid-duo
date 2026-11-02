// Critically damped spring: follows a stepping target smoothly at frame rate
// and never overshoots. Semi-implicit Euler, stable while frequency*dt < 2.
export class DampedSpring {
    constructor(value = 0, frequency = 14) {
        this.value = value;
        this.velocity = 0;
        this.frequency = frequency;
    }

    advance(target, dt) {
        const step = Math.min(Math.max(dt, 0), 1 / 20);
        const w = this.frequency;
        const acceleration = w * w * (target - this.value) - 2 * w * this.velocity;
        this.velocity += acceleration * step;
        this.value += this.velocity * step;
    }

    snap(target) {
        this.value = target;
        this.velocity = 0;
    }

    isSettled(target, tolerance = 0.01) {
        return Math.abs(this.value - target) < tolerance && Math.abs(this.velocity) < tolerance * 10;
    }
}
