// The on-screen side. The fold shader is attached as an offscreen effect to
// the shell's own UI tree, so everything underneath keeps running live and
// the shader just re-projects and frosts each frame. Nothing is captured.
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const GL_LINEAR = 9729;
const GL_LINEAR_MIPMAP_LINEAR = 9987;

const FoldEffect = GObject.registerClass(
class FoldEffect extends Clutter.ShaderEffect {
    _init(source) {
        super._init();
        this.set_shader_source(source);
        this._params = null;
        this._strength = 1;
    }

    setParams(params, strength, width, height) {
        this._params = {params, width, height};
        this._strength = strength;
        this.queue_repaint();
    }

    vfunc_paint_target(node, context) {
        const pipeline = this.get_pipeline();
        // Mip levels are the blur pyramid.
        pipeline.set_layer_filters(0, GL_LINEAR_MIPMAP_LINEAR, GL_LINEAR);
        if (this._params) {
            const {params: p, width, height} = this._params;
            // GJS returns [ok, width, height] for this out-parameter call.
            const size = this.get_target_size();
            const [texW, texH] = size.length === 3 ? size.slice(1) : size;
            const f = (name, v) => this.set_uniform_value(name, parseFloat(v) - 1e-9);
            p.inverse.forEach((v, i) => f(`h${i}`, v));
            f('width', width); f('height', height);
            f('texW', texW); f('texH', texH);
            f('maxRadius', p.maxBlurRadius);
            f('blurStrength', p.blurStrength); f('blurFloor', p.blurFloor);
            f('maxDim', p.maxDim);
            f('maxLevel', Math.max(Math.floor(Math.log2(Math.min(texW, texH))) - 1, 0));
            f('dimStart', p.dimStart); f('dimStrength', p.dimStrength);
            f('dimReach', p.dimReach); f('dimHinge', p.dimHingeFloor);
            f('sheenAmount', p.sheenAmount); f('sheenPos', p.sheenPosition);
            f('grain', p.grain); f('time', p.time);
            f('topEdge', p.topEdge); f('recede', p.recede);
            f('strength', this._strength);
        }
        super.vfunc_paint_target(node, context);
    }
});

export class FoldOverlay {
    constructor(shaderSource) {
        this.effect = new FoldEffect(shaderSource);
        this.target = Main.layoutManager.uiGroup;
        this._attached = false;
        this._fit();
    }

    _fit() {
        const m = Main.layoutManager.primaryMonitor;
        this.width = m ? m.width : global.stage.width;
        this.height = m ? m.height : global.stage.height;
    }

    // Called when a fold starts. Nothing to capture: the picture is live.
    begin() { this._fit(); }

    show() {
        if (this._attached) return;
        this.target.add_effect_with_name('lid-duo', this.effect);
        this._attached = true;
    }

    hide() {
        if (!this._attached) return;
        this.target.remove_effect(this.effect);
        this._attached = false;
    }

    get shown() { return this._attached; }

    render(params, strength) {
        this.effect.setParams(params, strength, this.width, this.height);
    }

    destroy() {
        this.hide();
    }
}

export function loadShader(dir) {
    const path = GLib.build_filenamev([dir, 'fold.glsl']);
    return Shell.get_file_contents_utf8_sync(path);
}
