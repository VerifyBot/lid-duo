// Lid Duo: the frosted fold that follows the lid. This file is glue only; the
// fold's logic lives in lib/ and is tested without a compositor.
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {FoldController} from './lib/controller.js';
import {FoldOverlay, loadShader} from './lib/overlay.js';
import {HingeSensor, findHingePath} from './lib/sensor.js';
import {PRESETS} from './lib/presets.js';

const DBUS_IFACE = `
<node>
  <interface name="org.gnome.Shell.Extensions.LidDuo">
    <method name="Sweep"><arg type="d" name="duration" direction="in"/></method>
    <method name="SetAngle"><arg type="d" name="degrees" direction="in"/></method>
    <method name="GetState"><arg type="s" name="json" direction="out"/></method>
    <method name="Shot"><arg type="s" name="path" direction="in"/></method>
  </interface>
</node>`;

const now = () => GLib.get_monotonic_time() / 1e6;

export default class LidDuoExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._overlay = new FoldOverlay(loadShader(this.path));
        this._controller = new FoldController(this._overlay, this._optionsFromSettings());
        this._controller.setEnabled(this._settings.get_boolean('enabled'));
        this._controller.locked = Main.sessionMode.isLocked;
        this._frameTimer = null;
        this._sensorPath = null;

        this._settingsIds = [
            this._settings.connect('changed::preset', () => this._applyEffect()),
            this._settings.connect('changed::custom', () => this._applyEffect()),
            this._settings.connect('changed::rest-delay', () => this._applyOptions()),
            this._settings.connect('changed::fade-out', () => this._applyOptions()),
            this._settings.connect('changed::rest-tolerance', () => this._applyOptions()),
            this._settings.connect('changed::enabled', () => {
                this._controller.setEnabled(this._settings.get_boolean('enabled'));
                if (!this._settings.get_boolean('enabled')) this._controller.abort();
                this._indicator?.sync();
            }),
            this._settings.connect('changed::sensor-path', () => this._startSensor()),
            this._settings.connect('changed::poll-ms', () => this._startSensor()),
            this._settings.connect('changed::show-indicator', () => this._syncIndicator()),
        ];
        this._sessionId = Main.sessionMode.connect('updated', () => {
            this._controller.locked = Main.sessionMode.isLocked;
            if (Main.sessionMode.isLocked) this._controller.abort();
        });
        // Sleep: drop the fold before the picture could survive into the lock screen.
        this._sleepId = Gio.DBus.system.signal_subscribe('org.freedesktop.login1',
            'org.freedesktop.login1.Manager', 'PrepareForSleep', '/org/freedesktop/login1',
            null, Gio.DBusSignalFlags.NONE, () => this._controller.abort());

        this._dbus = Gio.DBusExportedObject.wrapJSObject(DBUS_IFACE, this);
        this._dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/LidDuo');

        this._startSensor();
        this._syncIndicator();
    }

    disable() {
        this._stopFrames();
        this._sensor?.stop(); this._sensor = null;
        this._dbus?.unexport(); this._dbus = null;
        if (this._sleepId) { Gio.DBus.system.signal_unsubscribe(this._sleepId); this._sleepId = 0; }
        if (this._sessionId) { Main.sessionMode.disconnect(this._sessionId); this._sessionId = 0; }
        this._settingsIds?.forEach(id => this._settings.disconnect(id)); this._settingsIds = null;
        this._indicator?.destroy(); this._indicator = null;
        this._controller?.abort(); this._controller = null;
        this._overlay?.destroy(); this._overlay = null;
        this._settings = null;
    }

    // --- settings -> controller ---
    _currentEffect() {
        const preset = this._settings.get_string('preset');
        if (preset === 'custom') {
            let custom = {};
            try { custom = JSON.parse(this._settings.get_string('custom')); } catch (e) { /* keep defaults */ }
            return {...PRESETS.duo, ...custom};
        }
        return PRESETS[preset] ?? PRESETS.duo;
    }

    _optionsFromSettings() {
        return {
            effect: this._currentEffect(),
            restDelay: this._settings.get_double('rest-delay'),
            fadeOut: this._settings.get_double('fade-out'),
            restTolerance: this._settings.get_double('rest-tolerance'),
        };
    }

    _applyEffect() { this._controller.setEffect(this._currentEffect()); this._indicator?.sync(); }
    _applyOptions() { this._controller.setOptions(this._optionsFromSettings()); }

    // --- sensor ---
    _startSensor() {
        this._sensor?.stop();
        this._sensor = null;
        let path = this._settings.get_string('sensor-path');
        if (!path) path = findHingePath();
        this._sensorPath = path;
        if (!path) { console.warn('[lid-duo] no hinge angle sensor found'); this._indicator?.sync(); return; }
        this._sensor = new HingeSensor(path, this._settings.get_int('poll-ms'), (angle, t) => {
            this._controller.sample(angle, t);
            this._afterInput(t);
        });
        this._sensor.start();
        this._indicator?.sync();
    }

    // Run the decider on each input; keep a frame timer only while the fold
    // is on screen (or a sweep is running).
    _afterInput(t) {
        if (this._frameTimer) return;
        const phase = this._controller.tick(t);
        if (phase !== 'idle' && phase !== 'armed') this._startFrames();
    }

    // One tick per compositor frame (vsynced), only while a fold is on screen.
    _startFrames() {
        if (this._frameTimer) return;
        // repeat_count does not loop in Clutter 18: the timeline completes
        // after `duration` and stops emitting, so restart it on completion.
        this._frameTimer = new Clutter.Timeline({actor: global.stage, duration: 60000});
        this._frameTimer.connect('completed', t => { if (this._frameTimer === t) t.start(); });
        this._frameTimer.connect('new-frame', () => {
            this._frames = (this._frames ?? 0) + 1;
            const phase = this._controller.tick(now());
            if (phase === 'idle' && !this._controller._sweep) this._stopFrames();
        });
        this._frameTimer.start();
    }

    _stopFrames() {
        if (!this._frameTimer) return;
        this._frameTimer.stop();
        this._frameTimer = 0;
    }

    // --- D-Bus test hooks ---
    Sweep(duration) {
        this._controller.sweep(duration, now());
        this._startFrames();
    }

    // Feed a fake reading. The real sensor pauses so the two streams cannot
    // interleave; a negative value hands control back to the sensor.
    SetAngle(degrees) {
        if (degrees < 0) { this._startSensor(); return; }
        if (this._sensor) { this._sensor.stop(); this._sensor = null; }
        const t = now();
        this._controller.sample(degrees, t);
        this._afterInput(t);
    }

    // Save a PNG of the whole stage (test aid; the shell's own screenshot
    // D-Bus API refuses callers that are not the portal).
    Shot(path) {
        const shooter = new Shell.Screenshot();
        const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
        shooter.screenshot(false, stream, (o, res) => {
            try { o.screenshot_finish(res); } catch (e) { console.warn(`[lid-duo] shot failed: ${e}`); }
        });
        global.stage.queue_redraw();
    }

    GetState() {
        const c = this._controller;
        return JSON.stringify({
            phase: c.phase, angle: c.tracker.angle, spring: c.spring.value,
            baseline: c.decider.baseline, shown: this._overlay.shown, strength: c.decider.releaseFactor(now()),
            frames: this._frames ?? 0, timer: !!this._frameTimer, playing: this._frameTimer ? this._frameTimer.is_playing() : null, elapsed: this._frameTimer ? this._frameTimer.get_elapsed_time() : null,
            sensorPath: this._sensorPath, preset: this._settings.get_string('preset'),
            enabled: c.enabled, locked: c.locked,
        });
    }

    // --- panel indicator ---
    _syncIndicator() {
        const want = this._settings.get_boolean('show-indicator');
        if (want && !this._indicator) {
            this._indicator = new Indicator(this);
            Main.panel.addToStatusArea(this.uuid, this._indicator);
        } else if (!want && this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}

const Indicator = GObject.registerClass(
class LidDuoIndicator extends PanelMenu.Button {
        _init(ext) {
            super._init(0.0, 'Lid Duo');
            this._ext = ext;
            this._icon = new St.Icon({icon_name: 'video-display-symbolic', style_class: 'system-status-icon'});
            this.add_child(this._icon);

            this._toggle = new PopupMenu.PopupSwitchMenuItem('Fold on lid close', true);
            this._toggle.connect('toggled', (_, on) => ext._settings.set_boolean('enabled', on));
            this.menu.addMenuItem(this._toggle);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            this._presetItems = {};
            for (const [key, label] of [['duo', 'Duo'], ['soft', 'Soft'], ['cinematic', 'Cinematic']]) {
                const item = new PopupMenu.PopupMenuItem(label);
                item.connect('activate', () => ext._settings.set_string('preset', key));
                this.menu.addMenuItem(item);
                this._presetItems[key] = item;
            }
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            const test = new PopupMenu.PopupMenuItem('Test sweep');
            test.connect('activate', () => ext.Sweep(1.6));
            this.menu.addMenuItem(test);

            this._status = new PopupMenu.PopupMenuItem('', {reactive: false, can_focus: false});
            this.menu.addMenuItem(this._status);
            this.sync();
        }

        sync() {
            const s = this._ext._settings;
            this._toggle.setToggleState(s.get_boolean('enabled'));
            const preset = s.get_string('preset');
            for (const [key, item] of Object.entries(this._presetItems))
                item.setOrnament(key === preset ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
            this._status.label.text = this._ext._sensorPath ? 'Hinge sensor: found' : 'Hinge sensor: not found';
            this._icon.opacity = s.get_boolean('enabled') ? 255 : 120;
        }
});
