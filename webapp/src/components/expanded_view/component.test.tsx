// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {createIntl} from 'react-intl';
import {CALL_EVENT, CONNECTION_QUALITY} from 'src/clients/call/constants';
import {CameraError, CameraState, type DeviceStatus} from 'src/clients/call/types';
import {DEGRADED_CALL_QUALITY_ALERT_WAIT} from 'src/constants';
import {FakeCallClient, installFakeCallClient} from 'src/test_utils/fake_call_client';
import {CallAlertStatesDefault, CallAlertType} from 'src/types/types';

import {CallSettingsButton} from './call_settings';
import DMVideoStage from './dm_video_stage';
import {ParticipantsGrid} from './participants_grid';

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
        const props = {
            theme: {type: 'Denim', sidebarBg: '#1e325c'},
            history: {},
            fetchCallState: jest.fn(),
            userCameraChanged: jest.fn(),
        };
        const view = new ExpandedView(props);
        view.setState = jest.fn();
        view.componentDidMount();
        return {view, props, callsClient};
    };

    afterEach(() => {
        window.callsClient = undefined;
    });

    test.each([CameraState.Off, CameraState.Loading, CameraState.Ready])('forwards the %s camera state for the call channel', (cameraState) => {
        const {view, props, callsClient} = mountView();

        callsClient.emit(CALL_EVENT.CAMERA_CHANGED, 'session-id', 'user-id', cameraState);

        expect(props.userCameraChanged).toHaveBeenCalledWith('channel-id', 'session-id', 'user-id', cameraState);
        view.componentWillUnmount();
    });

    test('stops forwarding camera changes once unmounted', () => {
        const {view, props, callsClient} = mountView();

        view.componentWillUnmount();
        callsClient.emit(CALL_EVENT.CAMERA_CHANGED, 'session-id', 'user-id', CameraState.Ready);

        expect(props.userCameraChanged).not.toHaveBeenCalled();
    });

    test('follows the client\'s mic status', () => {
        const {view, callsClient} = mountView();

        callsClient.setMicStatus('blocked');

        expect(view.setState).toHaveBeenCalledWith({micStatus: 'blocked'});
        view.componentWillUnmount();
    });

    test.each([
        [CameraError.PermissionDenied, 'cameraPermissionDenied'],
        [CameraError.NotFound, 'cameraNotFound'],
        [CameraError.DeviceInUse, 'cameraInUse'],
        [CameraError.Disconnected, 'cameraDisconnected'],
        [CameraError.Other, 'cameraFailed'],
    ])('shows only the %s camera alert for a camera error', (error, alertID) => {
        const {view, callsClient} = mountView();
        (view.setState as jest.Mock).mockClear();

        callsClient.emit(CALL_EVENT.CAMERA_ERROR, error);

        const update = (view.setState as jest.Mock).mock.calls[0][0];
        const {alerts} = update({alerts: {...CallAlertStatesDefault, cameraFailed: {active: true, show: true}}});
        const shown = Object.entries(alerts as Record<string, {show: boolean}>).filter(([, state]) => state.show).map(([id]) => id);
        expect(shown).toEqual([alertID]);
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

describe('ExpandedView in a direct message video call', () => {
    const intl = createIntl({locale: 'en', messages: {}});
    const session = {session_id: 'session-id', user_id: 'user-id', unmuted: false, raised_hand: 0};

    type ElementProps = {id?: string; children?: React.ReactNode};

    const findElement = (node: React.ReactNode, match: (el: React.ReactElement<Record<string, unknown>>) => boolean): React.ReactElement<Record<string, unknown>> | null => {
        if (!React.isValidElement<ElementProps>(node)) {
            return null;
        }
        const el = node as React.ReactElement<Record<string, unknown>>;
        if (match(el)) {
            return el;
        }
        for (const child of React.Children.toArray(node.props.children)) {
            const found = findElement(child, match);
            if (found) {
                return found;
            }
        }
        return null;
    };

    const byID = (id: string) => (el: React.ReactElement<Record<string, unknown>>) => el.props.id === id;

    const makeView = (props: Record<string, unknown> = {}) => {
        installFakeCallClient();
        const view = new ExpandedView({
            intl,
            show: true,
            theme: {type: 'Denim', sidebarBg: '#1e325c'},
            history: {},
            sessions: [session],
            otherSessions: [],
            profiles: {},
            currentSession: session,
            currentUserID: session.user_id,
            callHostID: session.user_id,
            channel: {id: 'channel-id', type: 'D', name: 'user-id__other-id'},
            dmVideoEnabled: true,
            isPhoneCall: false,
            clientConnecting: false,
            isCameraOn: false,
            ownConnectionState: 'good',
            recordingsEnabled: true,
            isRecording: false,
            isDMCalling: false,
            ...props,
        });
        view.state = {...view.state, micStatus: 'ready'};
        return view;
    };

    afterEach(() => {
        window.callsClient = undefined;
    });

    test('shows the mic and camera device controls, a raise hand button and the stage', () => {
        const tree = makeView().render();

        expect(findElement(tree, byID('calls-popout-mic'))?.props.toggleId).toBe('calls-popout-mute-button');
        expect(findElement(tree, byID('calls-popout-camera'))).not.toBeNull();
        expect(findElement(tree, byID('calls-popout-raise-hand-button'))?.props.ariaPressed).toBe(false);
        expect(findElement(tree, (el) => el.type === DMVideoStage)?.props).toEqual({selfSessionID: 'session-id', otherSessionID: undefined});
        expect(findElement(tree, (el) => el.type === ParticipantsGrid)).toBeNull();
    });

    test('moves recording into the More menu', () => {
        const tree = makeView().render();

        expect(findElement(tree, byID('calls-popout-record-button'))).toBeNull();
        expect(findElement(tree, (el) => el.type === CallSettingsButton)?.props.recordItem).toMatchObject({isRecording: false, disabled: false});
    });

    test('keeps the audio layout when video calls are off', () => {
        const tree = makeView({dmVideoEnabled: false}).render();

        expect(findElement(tree, byID('calls-popout-camera'))).toBeNull();
        expect(findElement(tree, byID('calls-popout-mute-button'))).not.toBeNull();
        expect(findElement(tree, byID('calls-popout-record-button'))).not.toBeNull();
        expect(findElement(tree, (el) => el.type === ParticipantsGrid)).not.toBeNull();
    });

    test('keeps the audio layout when the call can\'t publish a camera', () => {
        const view = makeView();
        (window.callsClient as unknown as {canPublishCamera: jest.Mock}).canPublishCamera.mockReturnValue(false);

        expect(findElement(view.render(), byID('calls-popout-camera'))).toBeNull();
    });

    test.each([
        ['poor', 'Your connection is poor. Video may pause.'],
        ['reconnecting', 'Reconnecting to the call…'],
    ])('shows one warning while the connection is %s', (ownConnectionState, message) => {
        const warnings = makeView({ownConnectionState}).getHeaderWarnings();

        expect(warnings.map((w: {id: string}) => w.id)).toEqual(['ownConnection']);
        expect(warnings[0].message).toBe(message);
    });

    test('hides the connection warning once dismissed, until the state changes', () => {
        const view = makeView({ownConnectionState: 'poor'});
        view.state = {...view.state, dismissedConnectionState: 'poor'};
        expect(view.getHeaderWarnings()).toEqual([]);

        view.setState = jest.fn();
        const prevProps = view.props;
        view.props = {...view.props, ownConnectionState: 'reconnecting'};
        view.componentDidUpdate(prevProps);

        expect(view.setState).toHaveBeenCalledWith({dismissedConnectionState: null});
    });

    test('replaces the call quality banner with the connection warning', () => {
        const view = makeView();
        view.state = {...view.state, alerts: {...view.state.alerts, degradedCallQuality: {active: true, show: true}}};

        expect(view.getHeaderWarnings()).toEqual([]);
    });

    type View = ReturnType<typeof makeView>;
    type Element = React.ReactElement<Record<string, unknown>>;

    // The view isn't mounted, so state updates are applied by hand.
    const applyStateUpdates = (view: View) => {
        view.setState = jest.fn((update) => {
            const patch = typeof update === 'function' ? update(view.state, view.props) : update;
            view.state = {...view.state, ...patch};
        });
        return view;
    };

    const callProp = (el: Element | null, name: string, ...args: unknown[]) => (el?.props[name] as (...a: unknown[]) => unknown)(...args);

    const updateProps = (view: View, props: Record<string, unknown>) => {
        const prevProps = view.props;
        view.props = {...prevProps, ...props};
        view.componentDidUpdate(prevProps);
    };

    const fakeClient = () => window.callsClient as unknown as FakeCallClient;

    test('keeps at most one device menu open', () => {
        const view = applyStateUpdates(makeView());
        const menusOpen = () => {
            const tree = view.render();
            return [findElement(tree, byID('calls-popout-mic'))?.props.menuOpen, findElement(tree, byID('calls-popout-camera'))?.props.menuOpen];
        };
        expect(menusOpen()).toEqual([false, false]);

        callProp(findElement(view.render(), byID('calls-popout-mic')), 'onMenuOpenChange', true);
        expect(menusOpen()).toEqual([true, false]);

        callProp(findElement(view.render(), byID('calls-popout-camera')), 'onMenuOpenChange', true);
        expect(menusOpen()).toEqual([false, true]);

        callProp(findElement(view.render(), byID('calls-popout-camera')), 'onMenuOpenChange', false);
        expect(menusOpen()).toEqual([false, false]);
    });

    test('switches the mic only when a different one is picked', () => {
        const builtInMic = {deviceId: 'mic-1', label: 'Built-in Mic', kind: 'audioinput', groupId: ''} as MediaDeviceInfo;
        const usbMic = {deviceId: 'mic-2', label: 'USB Mic', kind: 'audioinput', groupId: ''} as MediaDeviceInfo;
        const view = applyStateUpdates(makeView());
        view.state = {...view.state, audioInputs: [builtInMic, usbMic], currentAudioInputDevice: builtInMic};
        const mic = () => findElement(view.render(), byID('calls-popout-mic'));
        expect(mic()?.props.selectedDeviceId).toBe('mic-1');

        callProp(mic(), 'onSelectDevice', usbMic);

        expect(fakeClient().setAudioInputDevice).toHaveBeenCalledWith(usbMic);
        expect(mic()?.props.selectedDeviceId).toBe('mic-2');

        callProp(mic(), 'onSelectDevice', usbMic);

        expect(fakeClient().setAudioInputDevice).toHaveBeenCalledTimes(1);
    });

    test('clears camera alerts once the camera turns on', () => {
        const view = applyStateUpdates(makeView());
        view.state = {...view.state, alerts: {...CallAlertStatesDefault, cameraFailed: {active: true, show: true}}};
        const warningIDs = () => view.getHeaderWarnings().map((w: {id: string}) => w.id);

        updateProps(view, {ownConnectionState: 'good'});
        expect(warningIDs()).toEqual(['cameraFailed']);

        updateProps(view, {isCameraOn: true});
        expect(warningIDs()).toEqual([]);
    });

    test('lists alerts as header warnings, dismissable only where configured', () => {
        const view = applyStateUpdates(makeView());
        view.state = {
            ...view.state,
            alerts: {
                ...CallAlertStatesDefault,
                missingAudioInput: {active: true, show: true},
                remoteAudioPlaybackBlocked: {active: true, show: true},
            },
        };

        const warnings = view.getHeaderWarnings();

        expect(warnings).toEqual([
            {
                id: 'missingAudioInput',
                tone: CallAlertType.Error,
                icon: 'microphone-off',
                message: 'Unable to find a valid audio input device. Try plugging in an audio input device.',
                onDismiss: expect.any(Function),
            },
            {
                id: 'remoteAudioPlaybackBlocked',
                tone: CallAlertType.Warning,
                icon: 'speaker',
                message: 'Your browser blocked call audio.',
                onDismiss: undefined,
            },
        ]);

        warnings[0].onDismiss();

        expect(view.getHeaderWarnings().map((w: {id: string}) => w.id)).toEqual(['remoteAudioPlaybackBlocked']);
        expect(view.state.alerts.missingAudioInput).toEqual({active: true, show: false});
    });

    test('dismissing the connection warning hides it for that state', () => {
        const view = applyStateUpdates(makeView({ownConnectionState: 'poor'}));

        view.getHeaderWarnings()[0].onDismiss();

        expect(view.state.dismissedConnectionState).toBe('poor');
        expect(view.getHeaderWarnings()).toEqual([]);
    });

    describe('recording from the More menu', () => {
        const recordItem = (view: View) => findElement(view.render(), (el) => el.type === CallSettingsButton)?.props.recordItem as {disabled: boolean; onToggle: () => Promise<void>} | undefined;

        test('starts a recording', async () => {
            const view = makeView({startCallRecording: jest.fn(), openModal: jest.fn()});

            await recordItem(view)?.onToggle();

            expect(view.props.startCallRecording).toHaveBeenCalledWith('channel-id');
            expect(view.props.openModal).not.toHaveBeenCalled();
        });

        test('asks to confirm stopping a recording', async () => {
            const view = makeView({isRecording: true, startCallRecording: jest.fn(), openModal: jest.fn()});

            await recordItem(view)?.onToggle();

            expect(view.props.openModal).toHaveBeenCalledWith(expect.objectContaining({dialogProps: {channelID: 'channel-id'}}));
            expect(view.props.startCallRecording).not.toHaveBeenCalled();
        });

        test('is disabled while the call is ringing', () => {
            expect(recordItem(makeView({isDMCalling: true}))?.disabled).toBe(true);
        });

        test.each([
            ['the user is not the host', {callHostID: 'other-id'}],
            ['recordings are off', {recordingsEnabled: false}],
        ])('is missing when %s', (_, props) => {
            expect(recordItem(makeView(props))).toBeUndefined();
        });
    });

    describe('chat focus', () => {
        const chatProps = {
            threadID: 'thread-id',
            isRhsOpen: false,
            rhsSelectedThreadID: undefined,
            selectRhsPost: jest.fn(),
            currentTeamID: 'team-id',
            channelTeam: {id: 'team-id', name: 'team'},
        };
        const openChat = (view: View) => updateProps(view, {isRhsOpen: true, rhsSelectedThreadID: 'thread-id'});
        const closeChat = (view: View) => updateProps(view, {isRhsOpen: false});
        const addChatPanel = () => {
            document.body.innerHTML = '<div id="sidebar-right"><textarea></textarea></div><button id="calls-popout-chat-button"></button><button id="other-button"></button>';
            return document.querySelector('#sidebar-right textarea') as HTMLTextAreaElement;
        };

        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
            document.body.innerHTML = '';
        });

        test('focuses the reply box once it appears after opening chat from the button', async () => {
            const view = makeView(chatProps);

            await view.toggleChat();
            expect(chatProps.selectRhsPost).toHaveBeenCalledWith('thread-id');
            openChat(view);
            jest.advanceTimersByTime(100);

            const input = addChatPanel();
            expect(input).not.toHaveFocus();
            jest.advanceTimersByTime(50);

            expect(input).toHaveFocus();
            expect(jest.getTimerCount()).toBe(0);
        });

        test('stops looking for the reply box after a second', async () => {
            const view = makeView(chatProps);
            await view.toggleChat();
            openChat(view);

            jest.advanceTimersByTime(1050);
            expect(jest.getTimerCount()).toBe(0);

            const input = addChatPanel();
            jest.advanceTimersByTime(1000);
            expect(input).not.toHaveFocus();
        });

        test('leaves focus alone when chat is opened some other way', () => {
            const input = addChatPanel();
            const view = makeView(chatProps);

            openChat(view);
            jest.runOnlyPendingTimers();

            expect(input).not.toHaveFocus();
        });

        test('stops looking for the reply box once unmounted', async () => {
            const view = makeView(chatProps);
            await view.toggleChat();
            openChat(view);
            expect(jest.getTimerCount()).toBe(1);

            view.componentWillUnmount();

            expect(jest.getTimerCount()).toBe(0);
        });

        test.each([
            ['in the chat panel', () => (document.querySelector('#sidebar-right textarea') as HTMLElement).focus(), true],
            ['lost with the panel', () => (document.activeElement as HTMLElement | null)?.blur(), true],
            ['elsewhere in the window', () => document.getElementById('other-button')?.focus(), false],
        ])('when chat closes with focus %s, focus returns to the chat button: %s', (_, placeFocus, returned) => {
            addChatPanel();
            const view = makeView({...chatProps, isRhsOpen: true, rhsSelectedThreadID: 'thread-id'});
            placeFocus();

            closeChat(view);

            expect(document.getElementById('calls-popout-chat-button') === document.activeElement).toBe(returned);
        });
    });
});

describe('ExpandedView call quality banner', () => {
    const intl = createIntl({locale: 'en', messages: {}});
    const session = {session_id: 'session-id', user_id: 'user-id', unmuted: false, raised_hand: 0};

    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        window.callsClient = undefined;
    });

    test('stays away for a while after it is dismissed', () => {
        const client = installFakeCallClient();
        client.audioDevices = {inputs: [{deviceId: 'mic-1', label: 'Mic', kind: 'audioinput', groupId: ''} as MediaDeviceInfo], outputs: []};
        const view = new ExpandedView({
            intl,
            theme: {type: 'Denim', sidebarBg: '#1e325c'},
            history: {},
            sessions: [session],
            currentSession: session,
            fetchCallState: jest.fn(),
        });
        view.setState = jest.fn((update) => {
            view.state = {...view.state, ...(typeof update === 'function' ? update(view.state, view.props) : update)};
        });
        view.componentDidMount();
        const bannerShown = () => view.state.alerts.degradedCallQuality.show;

        client.emit(CALL_EVENT.QUALITY_CHANGED, CONNECTION_QUALITY.Poor);
        expect(bannerShown()).toBe(true);

        view.renderAlertBanner().props.onClose();
        expect(bannerShown()).toBe(false);

        client.emit(CALL_EVENT.QUALITY_CHANGED, CONNECTION_QUALITY.Lost);
        expect(bannerShown()).toBe(false);

        jest.advanceTimersByTime(DEGRADED_CALL_QUALITY_ALERT_WAIT);
        client.emit(CALL_EVENT.QUALITY_CHANGED, CONNECTION_QUALITY.Poor);
        expect(bannerShown()).toBe(true);

        view.componentWillUnmount();
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
