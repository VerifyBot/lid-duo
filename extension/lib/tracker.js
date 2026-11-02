// Turns raw 10 Hz sensor readings into a velocity, a short-term prediction,
// and a "how long has the lid been still" clock.
export class AngleTracker {
    constructor({tolerance = 1, closingSpeed = 2, predictionFloor = 40, sensorLatency = 0.04,
        maxSpeed = 720, moveSpeed = 12, sensorPeriod = 0.1, settledTolerance = 4, settleTime = 1.5} = {}) {
        this.tolerance = tolerance;
        this.settledTolerance = settledTolerance; // wider dead zone once the lid has rested
        this.settleTime = settleTime;             // s of rest before the wide zone applies
        this.maxSpeed = maxSpeed;   // deg/s; a hand cannot slam a lid faster
        this.moveSpeed = moveSpeed; // deg/s below which the lid counts as resting (sensor jitter is ~1°/sample)
        this.sensorPeriod = sensorPeriod; // the sensor's own update interval; polls in between repeat the value
        this.closingSpeed = closingSpeed;
        this.predictionFloor = predictionFloor;
        this.sensorLatency = sensorLatency;
        this.angle = 0;
        this.velocity = 0;          // deg/s, negative while closing
        this.lastChange = 0;        // last time the reading changed at all
        this.lastSample = 0;
        this.lastClosing = -Infinity;
        this.lastOpening = -Infinity;
        this.lastMove = 0;          // last time the reading left the rest anchor
        this._anchor = null;
        this._hasSample = false;
    }

    push(reading, time) {
        if (!this._hasSample) {
            this.angle = reading;
            this._anchor = reading;
            this.lastChange = this.lastSample = this.lastMove = time;
            this._hasSample = true;
            return;
        }
        const previous = this.angle;
        this.angle = reading;
        if (reading !== previous) {
            // The sensor updates about every sensorPeriod; we poll faster, so
            // the time since the last *change* is the real interval. Floor it
            // so a late poll cannot inflate a 1° blip into a fast move.
            const dt = Math.max(time - this.lastChange, this.sensorPeriod * 0.8);
            const v = Math.min(Math.max((reading - previous) / dt, -this.maxSpeed), this.maxSpeed);
            // Smooth like upstream, but a move starting from rest takes the
            // instant value so the first frame is not half-speed.
            this.velocity = this.velocity === 0 ? v : 0.5 * v + 0.5 * this.velocity;
            this.lastChange = time;
        } else if (time - this.lastChange > this.sensorPeriod * 1.5) {
            // No new reading for longer than the sensor period: it stopped.
            this.velocity = 0;
        }
        // The anchor is the debounced angle. While the lid is resting the
        // dead zone widens, so wobble and sensor noise never reach it.
        if (Math.abs(reading - this._anchor) > this.effectiveTolerance(time)) {
            this._anchor = reading;
            this.lastMove = time;
        }
        this.lastSample = time;
        if (this.velocity <= -this.closingSpeed) this.lastClosing = time;
        if (this.velocity >= this.closingSpeed) this.lastOpening = time;
    }

    // Seconds the reading has stayed within the dead zone of its rest anchor.
    stillFor(time) {
        return Math.max(time - this.lastMove, 0);
    }

    isSettled(time) { return this.stillFor(time) >= this.settleTime; }

    effectiveTolerance(time) { return this.isSettled(time) ? this.settledTolerance : this.tolerance; }

    get anchor() { return this._anchor; }

    // What the spring should follow: the reading carried forward while the
    // lid is clearly moving; the rest anchor while it is not, so ±1° sensor
    // jitter never reaches the picture.
    smoothTarget(time) {
        if (Math.abs(this.velocity) < this.moveSpeed) return this._anchor;
        if (this.stillFor(time) > 0.3) return this._anchor;   // reading wobbles, anchor did not move
        return this.extrapolatedAngle(time);
    }

    // Carry the last movement forward between sensor refreshes so the picture
    // moves every frame instead of stepping ten times a second.
    extrapolatedAngle(time, horizon = 0.11) {
        const age = Math.min(Math.max(time - this.lastChange, 0), horizon);
        return this.angle + this.velocity * age;
    }

    // Where a fast-closing lid most likely is right now.
    predictedAngle(time) {
        if (this.velocity >= -this.predictionFloor) return this.angle;
        const age = Math.min(Math.max(time - this.lastChange, 0), 0.12);
        return this.angle + this.velocity * (age + this.sensorLatency);
    }

    isClosing(time, memory) { return time - this.lastClosing < memory; }
    isOpening(time, memory) { return time - this.lastOpening < memory; }
}
