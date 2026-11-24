// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {waitFor} from '@testing-library/react';
import initialState from 'mattermost-redux/store/initial_state';
import {AnyAction} from 'redux';
import CallClient, {CALL_EVENT, CameraState} from 'src/clients/call';
import RestClient from 'src/clients/rest';
import AudioDevicesSettingsSection from 'src/components/user_settings/audio_devices_settings_section';
import RaiseHandSettingsSection from 'src/components/user_settings/raise_hand_settings_section';
import ScreenSharingSettingsSection from 'src/components/user_settings/screen_sharing_settings_section';
import VideoDevicesSettingsSection from 'src/components/user_settings/video_devices_settings_section';
import reducer from 'src/reducers';
import {userCameraOff, userCameraOn} from 'src/state/camera_on_ids/actions';
import {PluginRegistry, Store} from 'src/types/mattermost-webapp';

import Plugin from './index';

// The expanded view reads webapp globals on import and is never rendered here.
jest.mock('src/components/expanded_view', () => () => null);

jest.mock('react-dom/client', () => ({
    createRoot: jest.fn(() => ({render: jest.fn(), unmount: jest.fn()})),
}));

jest.mock('src/clients/call', () => ({
    ...jest.requireActual('src/clients/call'),
    __esModule: true,
    default: jest.fn(),
}));

jest.mock('src/clients/rest', () => ({
    __esModule: true,
    default: {fetch: jest.fn(), setUrl: jest.fn()},
}));

const CHANNEL_ID = 'dm-channel-id';
const USER_ID = 'user-id';

const pluginDefaults = reducer(undefined, {type: 'init'} as AnyAction);

const makeState = (enableDMVideo: boolean) => ({
    ...initialState,
    entities: {
        ...initialState.entities,
        users: {
            ...initialState.entities.users,
            currentUserId: USER_ID,
            profiles: {[USER_ID]: {id: USER_ID, roles: 'system_user'}},
        },
        channels: {
            ...initialState.entities.channels,
            channels: {[CHANNEL_ID]: {id: CHANNEL_ID, type: 'D', name: `${USER_ID}__other-id`}},
        },
    },
    'plugins-com.mattermost.calls': {
        ...pluginDefaults,
        callsConfig: {...pluginDefaults.callsConfig, EnableDMVideo: enableDMVideo},
    },
}) as unknown as GlobalState;

const makeStore = (state: GlobalState) => {
    const listeners: Array<() => void> = [];
    return {
        getState: () => state,
        dispatch: jest.fn(() => ({})),
        subscribe: jest.fn((listener: () => void) => {
            listeners.push(listener);
            return () => {};
        }),
        notify: () => listeners.forEach((listener) => listener()),
    };
};

type FakeRegistry = Record<string, jest.Mock>;

const makeRegistry = () => new Proxy({} as FakeRegistry, {
    get: (target, prop: string) => {
        target[prop] ??= jest.fn(() => `${prop}-id`);
        return target[prop];
    },
});

type Handler = (...args: unknown[]) => void;

const makeCallClient = () => {
    const handlers = new Map<string, Handler>();
    const client = {
        channelID: '',
        on: jest.fn((event: string, handler: Handler) => {
            handlers.set(event, handler);
        }),
        connect: jest.fn(({channelID}: {channelID: string}) => {
            client.channelID = channelID;
            return Promise.resolve();
        }),
        disconnect: jest.fn(),
        getSessionID: jest.fn(() => 'session-id'),
        emit: (event: string, ...args: unknown[]) => handlers.get(event)?.(...args),
    };
    return client;
};

// initialize is private, but it is what the webapp calls when loading the plugin.
type InitializablePlugin = {initialize: (registry: PluginRegistry, store: Store) => void};

const initializePlugin = (plugin: Plugin, registry: FakeRegistry, store: ReturnType<typeof makeStore>) => {
    (plugin as unknown as InitializablePlugin).initialize(registry as unknown as PluginRegistry, store as unknown as Store);
};

describe('Plugin', () => {
    let plugin: Plugin;

    beforeEach(() => {
        plugin = new Plugin();
        (RestClient.fetch as jest.Mock).mockResolvedValue([]);
    });

    afterEach(() => {
        plugin.uninitialize();
        delete window.callsClient;
        delete window.currentCallData;
    });

    describe('camera events', () => {
        const joinCall = async (store: ReturnType<typeof makeStore>) => {
            const client = makeCallClient();
            (CallClient as unknown as jest.Mock).mockImplementation(() => client);
            initializePlugin(plugin, makeRegistry(), store);

            window.dispatchEvent(new MessageEvent('message', {
                origin: window.origin,
                data: {type: 'connectCall', channelID: CHANNEL_ID},
            }));
            await waitFor(() => expect(client.connect).toHaveBeenCalled());
            return client;
        };

        test('stores camera changes for the call channel', async () => {
            const store = makeStore(makeState(true));
            const client = await joinCall(store);

            client.emit(CALL_EVENT.CAMERA_CHANGED, 'other-session-id', 'other-id', CameraState.Ready);
            expect(store.dispatch).toHaveBeenCalledWith(userCameraOn(CHANNEL_ID, 'other-session-id', 'other-id'));

            client.emit(CALL_EVENT.CAMERA_CHANGED, 'other-session-id', 'other-id', CameraState.Off);
            expect(store.dispatch).toHaveBeenCalledWith(userCameraOff(CHANNEL_ID, 'other-session-id', 'other-id'));
        });

        test('uses an empty channel ID once the client is gone', async () => {
            const store = makeStore(makeState(true));
            const client = await joinCall(store);
            delete window.callsClient;

            client.emit(CALL_EVENT.CAMERA_CHANGED, 'other-session-id', 'other-id', CameraState.Loading);

            expect(store.dispatch).toHaveBeenCalledWith(userCameraOn('', 'other-session-id', 'other-id'));
        });
    });

    describe('user settings', () => {
        const registeredSections = async (enableDMVideo: boolean) => {
            const registry = makeRegistry();
            const store = makeStore(makeState(enableDMVideo));
            initializePlugin(plugin, registry, store);

            store.notify();

            // The first registration happens before the config loads.
            await waitFor(() => expect(registry.registerUserSettings).toHaveBeenCalledTimes(2));
            return registry.registerUserSettings.mock.lastCall[0].sections;
        };

        test('includes Video devices when DM video is enabled', async () => {
            expect(await registeredSections(true)).toEqual([
                {title: 'Audio devices settings', component: AudioDevicesSettingsSection},
                {title: 'Video devices settings', component: VideoDevicesSettingsSection},
                {title: 'Screen sharing settings', component: ScreenSharingSettingsSection},
                {title: 'Raise hand settings', component: RaiseHandSettingsSection},
            ]);
        });

        test('leaves out Video devices when DM video is disabled', async () => {
            expect(await registeredSections(false)).toEqual([
                {title: 'Audio devices settings', component: AudioDevicesSettingsSection},
                {title: 'Screen sharing settings', component: ScreenSharingSettingsSection},
                {title: 'Raise hand settings', component: RaiseHandSettingsSection},
            ]);
        });
    });
});
