export const MUTE_UNMUTE = 'mute-unmute';
export const RAISE_LOWER_HAND = 'raise-lower-hand';
export const MAKE_REACTION = 'make-reaction';
export const SHARE_UNSHARE_SCREEN = 'share-unshare-screen';
export const PARTICIPANTS_LIST_TOGGLE = 'participants-list-toggle';
export const JOIN_CALL = 'join-call';
export const LEAVE_CALL = 'leave-call';
export const PUSH_TO_TALK = 'push-to-talk';
export const RECORDING_TOGGLE = 'recording-toggle';

const globalMappings = {
    [isMac() ? 'meta+alt+s' : 'ctrl+alt+s']: JOIN_CALL,
};

const widgetMappings = {
    [isMac() ? 'meta+shift+space' : 'ctrl+shift+space']: MUTE_UNMUTE,
    [isMac() ? 'meta+shift+y' : 'ctrl+shift+y']: RAISE_LOWER_HAND,
    [isMac() ? 'meta+shift+x' : 'ctrl+shift+x']: MAKE_REACTION,
    [isMac() ? 'meta+shift+e' : 'ctrl+shift+e']: SHARE_UNSHARE_SCREEN,
    'alt+p': PARTICIPANTS_LIST_TOGGLE,
    [isMac() ? 'meta+shift+p' : 'ctrl+shift+p']: PARTICIPANTS_LIST_TOGGLE,
    [isMac() ? 'meta+shift+l' : 'ctrl+shift+l']: LEAVE_CALL,
};

const popoutMappings = {
    ...widgetMappings,
    space: PUSH_TO_TALK,
    [isMac() ? 'meta+alt+r' : 'ctrl+alt+r']: RECORDING_TOGGLE,
};

export const keyMappings: {[key: string]: {[key: string]: string}} = {
    global: globalMappings,
    widget: widgetMappings,
    popout: popoutMappings,
};

type reverseKeyMap = {
    [key: string]: {
        [key: string]: string[],
    },
};

export const reverseKeyMappings = (() => {
    const map : reverseKeyMap = {};

    for (const [scope, mappings] of Object.entries(keyMappings)) {
        map[scope] = {};
        for (const [sequence, action] of Object.entries(mappings)) {
            if (map[scope][action]) {
                map[scope][action].push(sequence);
            } else {
                map[scope][action] = [sequence];
            }
        }
    }

    return map;
})();

export function keyToAction(scope: string, ev: KeyboardEvent) {
    if (!ev.key || !ev.code) {
        return null;
    }

    const key = ev.key.toLowerCase();
    const code = ev.code.replace('Key', '').toLowerCase();

    const mod = `${ev.metaKey ? 'meta+' : ''}${ev.ctrlKey ? 'ctrl+' : ''}${ev.shiftKey ? 'shift+' : ''}${ev.altKey ? 'alt+' : ''}`;
    const mapKey = mod + key;
    const mapCode = mod + code;

    // We give precedence to ev.key to potentially support other keyboard
    // layouts but also fallback on checking ev.code if the mapping is not found.
    const action = keyMappings[scope][mapKey] || keyMappings[scope][mapCode];

    if (action) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
    }

    return action;
}

export function isMac() {
    return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}
