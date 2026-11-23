// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {createIntl} from 'react-intl';
import {CallStoreSyncOptions, syncCallClientToStore} from 'src/call_store_sync';
import {CALL_EVENT} from 'src/clients/call/constants';
import {CameraState, type DeviceStatus} from 'src/clients/call/types';
import {userCameraChanged} from 'src/state/camera_on_ids/actions';
import {installFakeCallClient} from 'src/test_utils/fake_call_client';

// media-chrome ships ESM that jest doesn't transform; the helper under test doesn't use it.
jest.mock('media-chrome/dist/react', () => ({
    MediaControlBar: 'div',
    MediaController: 'div',
    MediaFullscreenButton: 'div',
}));

// The component reads window.ProductApi at module scope for its contextType, so the global has
// to exist before it is required.
window.ProductApi = {
    WebSocketProvider: React.createContext(null),
} as unknown as typeof window.ProductApi;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {default: ExpandedView, isActiveElementInteractable} = require('./component');

describe('ExpandedView call client events', () => {
    // Mounting the full view needs most of the app; componentDidMount alone wires the call client.
    const mountView = () => {
        const callsClient = installFakeCallClient();
        const dispatch = jest.fn();
        const props = {
            theme: {type: 'Denim', sidebarBg: '#1e325c'},
            history: {},
            fetchCallState: jest.fn(),
            syncCallClientToStore: (client: Parameters<typeof syncCallClientToStore>[0], options: CallStoreSyncOptions) => syncCallClientToStore(client, {dispatch, getState: () => ({}) as never}, options),
        };
        const view = new ExpandedView(props);
        view.setState = jest.fn();
        view.componentDidMount();
        return {view, dispatch, callsClient};
    };

    afterEach(() => {
        window.callsClient = undefined;
    });

    test.each([CameraState.Off, CameraState.Loading, CameraState.Ready])('forwards the %s camera state for the call channel', (cameraState) => {
        const {view, dispatch, callsClient} = mountView();

        callsClient.emit(CALL_EVENT.CAMERA_CHANGED, 'session-id', 'user-id', cameraState);

        expect(dispatch).toHaveBeenCalledWith(userCameraChanged('channel-id', 'session-id', 'user-id', cameraState));
        view.componentWillUnmount();
    });

    test('stops forwarding camera changes once unmounted', () => {
        const {view, dispatch, callsClient} = mountView();

        view.componentWillUnmount();
        callsClient.emit(CALL_EVENT.CAMERA_CHANGED, 'session-id', 'user-id', CameraState.Ready);

        expect(dispatch).not.toHaveBeenCalled();
    });

    test('follows the client\'s mic status', () => {
        const {view, callsClient} = mountView();

        callsClient.setMicStatus('blocked');

        expect(view.setState).toHaveBeenCalledWith({micStatus: 'blocked'});
        view.componentWillUnmount();
    });
});

describe('ExpandedView mute button', () => {
    const intl = createIntl({locale: 'en', messages: {}});
    const session = {session_id: 'session-id', user_id: 'user-id', unmuted: false, raised_hand: 0};

    type ElementProps = {id?: string; children?: React.ReactNode};

    const findByID = (node: React.ReactNode, id: string): React.ReactElement<Record<string, unknown>> | null => {
        if (!React.isValidElement<ElementProps>(node)) {
            return null;
        }
        if (node.props.id === id) {
            return node as React.ReactElement<Record<string, unknown>>;
        }
        for (const child of React.Children.toArray(node.props.children)) {
            const found = findByID(child, id);
            if (found) {
                return found;
            }
        }
        return null;
    };

    // Rendering the full tree needs most of the app, so this reads the button the view describes.
    const muteButton = (micStatus: DeviceStatus, unmuted = false) => {
        installFakeCallClient();
        const view = new ExpandedView({
            intl,
            show: true,
            theme: {type: 'Denim', sidebarBg: '#1e325c'},
            history: {},
            sessions: [],
            profiles: {},
            currentSession: {...session, unmuted},
            currentUserID: session.user_id,
        });
        view.state = {...view.state, micStatus};
        const button = findByID(view.render(), 'calls-popout-mute-button');
        if (!button) {
            throw new Error('no mute button');
        }
        return button.props;
    };

    afterEach(() => {
        window.callsClient = undefined;
    });

    test.each([
        ['a ready muted mic', 'ready', false, 'Unmute', 'Or hold space bar', true, false],
        ['a ready unmuted mic', 'ready', true, 'Mute', '', true, false],
        ['a starting mic', 'starting', false, 'Unmute', 'Or hold space bar', false, true],
        ['a missing mic', 'missing', false, 'No audio input devices', 'Try plugging in an audio input device.', false, true],
        ['a blocked mic', 'blocked', false, 'No audio input permissions', 'Allow microphone access to Mattermost.', true, true],
    ] as const)('%s sets the tooltip, toggle and availability', (_, micStatus, unmuted, tooltipText, tooltipSubtext, canToggle, unavailable) => {
        const props = muteButton(micStatus, unmuted);

        expect(props.tooltipText).toBe(tooltipText);
        expect(props.ariaLabel).toBe(tooltipText);
        expect(props.tooltipSubtext).toBe(tooltipSubtext);
        expect(typeof props.onToggle === 'function').toBe(canToggle);
        expect(props.unavailable).toBe(unavailable);
        expect(props.shortcut === undefined).toBe(unavailable);
    });
});

describe('isActiveElementInteractable', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        (document.activeElement as HTMLElement | null)?.blur();
    });

    test('returns false when nothing is focused', () => {
        jest.spyOn(document, 'activeElement', 'get').mockReturnValueOnce(null);

        expect(isActiveElementInteractable()).toBe(false);
    });

    test.each(['input', 'select', 'button', 'textarea'])('returns true for a focused %s', (tag) => {
        const el = document.createElement(tag);
        document.body.appendChild(el);
        el.focus();

        expect(isActiveElementInteractable()).toBe(true);
    });

    // jsdom doesn't implement isContentEditable, so it's defined explicitly.
    test('returns true for a focused contenteditable element', () => {
        const el = document.createElement('div');
        el.tabIndex = 0;
        Object.defineProperty(el, 'isContentEditable', {value: true});
        document.body.appendChild(el);
        el.focus();

        expect(isActiveElementInteractable()).toBe(true);
    });

    test('returns false for a focused non-editable element', () => {
        const el = document.createElement('div');
        el.tabIndex = 0;
        Object.defineProperty(el, 'isContentEditable', {value: false});
        document.body.appendChild(el);
        el.focus();

        expect(isActiveElementInteractable()).toBe(false);
    });
});
