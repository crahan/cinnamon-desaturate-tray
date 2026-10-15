// Apply desaturation, brightness and contrast effects to all system tray icons.
//
// Tray icons come from two applets:
//   - xapp-status@cinnamon.org: StatusNotifier / XAppStatusIcon icons (e.g. 1Password, Electron apps).
//     Many of these send raw pixmap data, so an icon theme override is not possible.
//   - systray@cinnamon.org: legacy XEmbed tray icons.
// The effects go on each icon actor (not on the containers), so the hover highlight keeps its color.

const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Main = imports.ui.main;
const AppletManager = imports.ui.appletManager;
const Settings = imports.ui.settings;

const XAPP_UUID = "xapp-status@cinnamon.org";
const SYSTRAY_UUID = "systray@cinnamon.org";
const DESATURATE_NAME = "tray-desaturate";
const BRIGHTNESS_CONTRAST_NAME = "tray-brightness-contrast";
// Settings key -> property name on TrayEffects.
const SETTINGS = {
    "desaturation": "desaturation",
    "brightness": "brightness",
    "contrast": "contrast",
    "color-on-hover": "colorOnHover",
};
const MAX_RETRIES = 30;

let uuid = null;
let trayEffects = null;

class TrayEffects {
    constructor() {
        // Bound settings values (percent): desaturation 0..100, brightness and contrast -100..100.
        this.desaturation = 100;
        this.brightness = 0;
        this.contrast = 0;
        // Show the original icon while the pointer is over it.
        this.colorOnHover = false;

        this._actors = new Map();
        this._patchedApplets = [];
        this._settingsChangedId = 0;
        this._iconAddedId = 0;
        this._rescanSourceId = 0;
        this._retriesLeft = MAX_RETRIES;

        this._settings = new Settings.ExtensionSettings(this, uuid);
        for (let [key, prop] of Object.entries(SETTINGS)) {
            this._settings.bind(key, prop, this._updateAll.bind(this));
        }
    }

    enable() {
        this._scan();
        // Applets get recreated when the panel layout changes; scan again then.
        this._settingsChangedId = global.settings.connect("changed::enabled-applets", () => this._queueScan());
        // New legacy XEmbed tray icons.
        this._iconAddedId = Main.statusIconDispatcher.connect("status-icon-added", (o, icon) => this._addActor(icon));
    }

    disable() {
        if (this._settingsChangedId) {
            global.settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        if (this._iconAddedId) {
            Main.statusIconDispatcher.disconnect(this._iconAddedId);
            this._iconAddedId = 0;
        }
        if (this._rescanSourceId) {
            GLib.source_remove(this._rescanSourceId);
            this._rescanSourceId = 0;
        }
        this._patchedApplets.forEach(applet => this._unpatchXappApplet(applet));
        this._patchedApplets = [];

        for (let [actor, state] of this._actors) {
            this._removeEffects(actor, state);
        }
        this._actors.clear();
        this._settings.finalize();
    }

    resetDefaults() {
        for (let key of Object.keys(SETTINGS)) {
            this._settings.setValue(key, this._settings.getDefaultValue(key));
        }
        // setValue() does not run the bound callback, so apply the values here.
        this._updateAll();
    }

    _addActor(actor) {
        if (this._actors.has(actor)) {
            return;
        }
        let state = { hovered: false, hoverActor: null, styleChangedId: 0, parentSetId: 0, destroyId: 0 };
        this._actors.set(actor, state);
        state.destroyId = actor.connect("destroy", () => {
            this._untrackHover(state);
            this._actors.delete(actor);
        });

        // The parent is the "applet-box" that gets the :hover pseudo-class. Systray icons
        // can get their parent after the status-icon-added signal, so follow parent changes.
        state.parentSetId = actor.connect("parent-set", () => this._trackHover(actor, state));
        this._trackHover(actor, state);

        actor.add_effect_with_name(DESATURATE_NAME, new Clutter.DesaturateEffect());
        actor.add_effect_with_name(BRIGHTNESS_CONTRAST_NAME, new Clutter.BrightnessContrastEffect());
        this._updateActor(actor, state);
    }

    _trackHover(actor, state) {
        this._untrackHover(state);
        let parent = actor.get_parent();
        if (parent && parent.has_style_pseudo_class) {
            state.hoverActor = parent;
            // St emits style-changed when a pseudo-class such as :hover is added or removed.
            state.styleChangedId = parent.connect("style-changed", () => this._onHoverMaybeChanged(actor, state));
        }
        this._onHoverMaybeChanged(actor, state);
    }

    _untrackHover(state) {
        if (state.hoverActor && state.styleChangedId) {
            state.hoverActor.disconnect(state.styleChangedId);
        }
        state.hoverActor = null;
        state.styleChangedId = 0;
    }

    _onHoverMaybeChanged(actor, state) {
        let hovered = state.hoverActor !== null && state.hoverActor.has_style_pseudo_class("hover");
        if (hovered !== state.hovered) {
            state.hovered = hovered;
            this._updateActor(actor, state);
        }
    }

    _removeEffects(actor, state) {
        this._untrackHover(state);
        for (let id of ["parentSetId", "destroyId"]) {
            if (state[id]) {
                actor.disconnect(state[id]);
                state[id] = 0;
            }
        }
        for (let name of [DESATURATE_NAME, BRIGHTNESS_CONTRAST_NAME]) {
            let effect = actor.get_effect(name);
            if (effect) {
                actor.remove_effect(effect);
            }
        }
    }

    _updateActor(actor, state) {
        let desaturate = actor.get_effect(DESATURATE_NAME);
        let brightnessContrast = actor.get_effect(BRIGHTNESS_CONTRAST_NAME);
        let showOriginal = this.colorOnHover && state.hovered;

        if (desaturate) {
            desaturate.factor = this.desaturation / 100;
            // Disabled effects cost nothing at paint time.
            desaturate.enabled = !showOriginal && this.desaturation > 0;
        }
        if (brightnessContrast) {
            brightnessContrast.set_brightness(this.brightness / 100);
            brightnessContrast.set_contrast(this.contrast / 100);
            brightnessContrast.enabled = !showOriginal && (this.brightness !== 0 || this.contrast !== 0);
        }
    }

    _updateAll() {
        for (let [actor, state] of this._actors) {
            this._updateActor(actor, state);
        }
    }

    _patchXappApplet(applet) {
        if (this._patchedApplets.includes(applet)) {
            return;
        }

        // Wrap addStatusIcon on this instance so new icons get the effects too.
        let self = this;
        let original = applet.addStatusIcon;
        applet.addStatusIcon = function(iconProxy) {
            original.call(this, iconProxy);
            let statusIcon = this.statusIcons[this.getKey(iconProxy)];
            if (statusIcon) {
                self._addActor(statusIcon.icon_holder);
            }
        };
        applet._trayEffectsOriginal = original;
        this._patchedApplets.push(applet);

        for (let key in applet.statusIcons) {
            this._addActor(applet.statusIcons[key].icon_holder);
        }
    }

    _unpatchXappApplet(applet) {
        if (applet._trayEffectsOriginal) {
            applet.addStatusIcon = applet._trayEffectsOriginal;
            delete applet._trayEffectsOriginal;
        }
    }

    _scan() {
        this._rescanSourceId = 0;

        let xappApplets = AppletManager.getRunningInstancesForUuid(XAPP_UUID);
        // Drop instances that no longer run (e.g. after an applet reload).
        this._patchedApplets = this._patchedApplets.filter(applet => xappApplets.includes(applet));
        xappApplets.forEach(applet => this._patchXappApplet(applet));

        // Each legacy tray icon sits in an St.Bin inside the systray applet's button_box.
        let systrayApplets = AppletManager.getRunningInstancesForUuid(SYSTRAY_UUID);
        for (let applet of systrayApplets) {
            for (let button of applet.button_box.get_children()) {
                if (button.child) {
                    this._addActor(button.child);
                }
            }
        }

        // Applets and extensions load in parallel at login, so the applets may not exist yet.
        if (xappApplets.length === 0 && systrayApplets.length === 0 && this._retriesLeft > 0) {
            this._retriesLeft--;
            this._queueScan();
        }

        return GLib.SOURCE_REMOVE;
    }

    _queueScan() {
        if (this._rescanSourceId === 0) {
            this._rescanSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => this._scan());
        }
    }
}

function init(metadata) {
    uuid = metadata.uuid;
}

function enable() {
    trayEffects = new TrayEffects();
    trayEffects.enable();
    // Cinnamon calls settings button callbacks on the object that enable() returns.
    return {
        resetDefaults: () => trayEffects.resetDefaults(),
    };
}

function disable() {
    if (trayEffects) {
        trayEffects.disable();
        trayEffects = null;
    }
}
