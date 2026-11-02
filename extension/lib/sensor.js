// Reads the hinge angle. Finds the IIO device whose name is "hinge" and polls
// its first angle channel (degrees) asynchronously so the compositor thread
// never blocks on the ~30 ms sysfs read.
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export function findHingePath() {
    const base = '/sys/bus/iio/devices';
    let dir;
    try { dir = Gio.File.new_for_path(base).enumerate_children('standard::name', 0, null); }
    catch (e) { return null; }
    let info;
    while ((info = dir.next_file(null)) !== null) {
        const name = info.get_name();
        if (!name.startsWith('iio:device')) continue;
        try {
            const [ok, bytes] = GLib.file_get_contents(`${base}/${name}/name`);
            if (ok && new TextDecoder().decode(bytes).trim() === 'hinge')
                return `${base}/${name}/in_angl0_raw`;
        } catch (e) { /* not readable, keep looking */ }
    }
    return null;
}

export class HingeSensor {
    // onAngle(degrees, monotonicSeconds)
    constructor(path, pollMs, onAngle) {
        this._file = Gio.File.new_for_path(path);
        this._pollMs = pollMs;
        this._onAngle = onAngle;
        this._timer = 0;
        this._busy = false;
        this._cancel = new Gio.Cancellable();
        this.lastAngle = null;
    }

    start() {
        if (this._timer) return;
        this._read();
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._pollMs, () => {
            this._read();
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop() {
        if (this._timer) { GLib.source_remove(this._timer); this._timer = 0; }
        this._cancel.cancel();
        this._cancel = new Gio.Cancellable();
    }

    _read() {
        if (this._busy) return;
        this._busy = true;
        this._file.load_contents_async(this._cancel, (file, res) => {
            this._busy = false;
            let text;
            try { [, text] = file.load_contents_finish(res); }
            catch (e) { return; }
            const value = parseFloat(new TextDecoder().decode(text));
            if (!Number.isFinite(value)) return;
            this.lastAngle = value;
            this._onAngle(value, GLib.get_monotonic_time() / 1e6);
        });
    }
}
