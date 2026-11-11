const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const Mainloop = imports.mainloop;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const Clutter = imports.gi.Clutter;
const ByteArray = imports.byteArray;

const CONF_DIR = GLib.get_home_dir() + '/.config/window-opacity';
const CONF = CONF_DIR + '/apps.json';
const MIN = 20;

function loadConf() {
    try {
        let [ok, data] = GLib.file_get_contents(CONF);
        if (ok) return JSON.parse(ByteArray.toString(data));
    } catch (e) {}
    return {};
}

function saveConf(c) {
    try {
        GLib.mkdir_with_parents(CONF_DIR, 0o755);
        GLib.file_set_contents(CONF, JSON.stringify(c, null, 1));
    } catch (e) { global.logError('window-opacity: ' + e); }
}

function isNormal(w) {
    if (!w) return false;
    let t = w.get_window_type();
    if (t !== Meta.WindowType.NORMAL && t !== Meta.WindowType.DIALOG) return false;
    try { if (w.is_skip_taskbar()) return false; } catch (e) {}
    return true;
}

function appKey(w) { return w.get_wm_class() || 'unknown'; }

function appName(w) {
    let k = appKey(w);
    if (k.startsWith('crx_') || k === 'unknown') return (w.get_title() || k).slice(0, 40);
    return k;
}

// Use Cinnamon's own window opacity when it exists, so Cinnamon still draws
// the windows underneath. Setting only the actor's opacity made Cinnamon skip
// drawing what was behind, so you saw the wallpaper instead.
const NATIVE = typeof Meta.Window.prototype.set_opacity === 'function';

function setOpacity(w, a, val) {
    if (NATIVE) {
        try {
            if (a.opacity !== 255) a.opacity = 255;
            w.set_opacity(val);
            return;
        } catch (e) {}
    }
    a.opacity = val;
}

function toVal(p) { return (p - MIN) / (100 - MIN); }
function toPct(v) { return Math.round(MIN + v * (100 - MIN)); }

class OpacityApplet extends Applet.IconApplet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);
        this.set_applet_icon_symbolic_name('display-brightness-symbolic');
        this.set_applet_tooltip('Window opacity (click, or scroll on this icon)');
        this.conf = loadConf();
        if (this.conf._default === undefined) this.conf._default = 75;
        this.target = null;
        this.sigs = [];

        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager.addMenu(this.menu);

        this.label = new PopupMenu.PopupMenuItem('', { reactive: false });
        this.menu.addMenuItem(this.label);
        this.slider = new PopupMenu.PopupSliderMenuItem(1);
        this.slider.connect('value-changed', (s, v) => this.setPct(toPct(v), false));
        this.menu.addMenuItem(this.slider);

        let solid = new PopupMenu.PopupMenuItem('Make this app solid');
        solid.connect('activate', () => this.setPct(100, true));
        this.menu.addMenuItem(solid);

        let useDef = new PopupMenu.PopupMenuItem('Put this app back on the default');
        useDef.connect('activate', () => {
            if (!this.targetOk()) return;
            delete this.conf[appKey(this.target)];
            saveConf(this.conf);
            this.applyAll();
            this.refresh(true);
        });
        this.menu.addMenuItem(useDef);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this.defLabel = new PopupMenu.PopupMenuItem('', { reactive: false });
        this.menu.addMenuItem(this.defLabel);
        this.defSlider = new PopupMenu.PopupSliderMenuItem(toVal(this.conf._default));
        this.defSlider.connect('value-changed', (s, v) => {
            this.conf._default = toPct(v);
            saveConf(this.conf);
            this.applyAll();
            this.refresh(false);
        });
        this.menu.addMenuItem(this.defSlider);

        this.sigs.push([global.display, global.display.connect('notify::focus-window', () => this.onFocus())]);
        for (let s of ['map', 'unminimize']) {
            try {
                this.sigs.push([global.window_manager, global.window_manager.connect(s, (wm, actor) => {
                    try { this.later(actor.get_meta_window()); } catch (e) {}
                })]);
            } catch (e) {}
        }

        this.actor.connect('scroll-event', (a, e) => {
            let d = e.get_scroll_direction();
            let cur = this.currentPct();
            if (d === Clutter.ScrollDirection.UP) this.setPct(Math.min(100, cur + 5), true);
            else if (d === Clutter.ScrollDirection.DOWN) this.setPct(Math.max(MIN, cur - 5), true);
            return Clutter.EVENT_STOP;
        });

        saveConf(this.conf);
        this.onFocus();
        this.applyAll();
    }

    targetOk() {
        try { return this.target && this.target.get_compositor_private() !== null; }
        catch (e) { return false; }
    }

    pctFor(w) {
        let v = this.conf[appKey(w)];
        return v !== undefined ? v : this.conf._default;
    }

    onFocus() {
        let w = global.display.focus_window;
        if (isNormal(w)) {
            this.target = w;
            try { this.apply(w); } catch (e) {}
        }
    }

    currentPct() { return this.targetOk() ? this.pctFor(this.target) : 100; }

    apply(w) {
        let a = w.get_compositor_private();
        if (!a) return;
        let pct = 100;
        try { if (!w.is_fullscreen()) pct = this.pctFor(w); } catch (e) { pct = this.pctFor(w); }
        setOpacity(w, a, Math.round(pct * 2.55));
    }

    later(w) {
        if (!isNormal(w)) return;
        for (let ms of [250, 700, 1500]) {
            Mainloop.timeout_add(ms, () => { try { this.apply(w); } catch (e) {} return false; });
        }
    }

    applyAll() {
        global.get_window_actors().forEach(a => {
            try { let w = a.get_meta_window(); if (isNormal(w)) this.apply(w); } catch (e) {}
        });
    }

    setPct(p, moveSlider) {
        if (!this.targetOk()) return;
        this.conf[appKey(this.target)] = p;
        saveConf(this.conf);
        this.applyAll();
        this.refresh(moveSlider);
    }

    refresh(moveSlider) {
        this.defLabel.label.set_text('Default for all apps: ' + this.conf._default + '%');
        if (!this.targetOk()) {
            this.label.label.set_text('Click on a window first');
            return;
        }
        let k = appKey(this.target);
        let own = this.conf[k] !== undefined;
        this.label.label.set_text(appName(this.target) + ': ' + this.currentPct() + '%' + (own ? '' : ' (default)'));
        if (moveSlider) this.slider.setValue(toVal(this.currentPct()));
    }

    on_applet_clicked() {
        this.refresh(true);
        this.menu.toggle();
    }

    on_applet_removed_from_panel() {
        this.sigs.forEach(([obj, id]) => { try { obj.disconnect(id); } catch (e) {} });
        global.get_window_actors().forEach(a => {
            try { a.opacity = 255; } catch (e) {}
            try { if (NATIVE) a.get_meta_window().set_opacity(255); } catch (e) {}
        });
    }
}

function main(metadata, orientation, panelHeight, instanceId) {
    return new OpacityApplet(metadata, orientation, panelHeight, instanceId);
}
