// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {AnyAction, applyMiddleware, combineReducers, createStore, Middleware} from 'redux';
import {thunk} from 'redux-thunk';
import {CALL_HOST, CALL_RECORDING_STATE, CALL_STATE, LIVE_CAPTION, USER_JOINED_TIMEOUT} from 'src/action_types';
import {CALL_EVENT} from 'src/clients/call/constants';
import {CameraState} from 'src/clients/call/types';
import reducer from 'src/reducers';
import {USER_CAMERA_OFF, USER_CAMERA_ON} from 'src/state/camera_on_ids/action_types';
import {PHONE_LEG_STATUS_CHANGED} from 'src/state/phone_legs/action_types';
import {SCREEN_SHARING_CLEARED, USER_SCREEN_ON} from 'src/state/screen_sharing_ids/action_types';
import {
    USER_HAND_LOWERED,
    USER_HAND_RAISED,
    USER_JOINED,
    USER_LEFT,
    USER_MUTED,
    USER_REACTED,
    USER_REACTED_TIMEOUT,
    USER_UNMUTED,
    USERS_VOICE_ACTIVITY_CHANGED,
} from 'src/state/session/action_types';
import {FakeCallClient, installFakeCallClient} from 'src/test_utils/fake_call_client';

import {CallStoreSyncOptions, syncCallClientToStore} from './call_store_sync';

const sharer = {session_id: 'sharer-session', user_id: 'sharer', unmuted: false, raised_hand: 0};

const makeStore = ({withSharer = true} = {}) => {
    const actions: AnyAction[] = [];
    const record: Middleware = () => (next) => (action) => {
        actions.push(action as AnyAction);
        return next(action);
    };
    const store = createStore(
        combineReducers({
            'plugins-com.mattermost.calls': reducer,
            entities: (state = {users: {currentUserId: 'me', profiles: {'user-1': {id: 'user-1'}}}, channels: {channels: {}}}) => state,
        }),
        {
            'plugins-com.mattermost.calls': {
                sessions: {'channel-id': {[sharer.session_id]: sharer}},
                screenSharingIDs: withSharer ? {'channel-id': sharer.session_id} : {},
            },
        } as never,
        applyMiddleware(thunk, record),
    );
    const types = () => actions.flatMap((action) => (action.meta?.batch ? action.payload : [action])).map((action: AnyAction) => action.type);
    return {store, actions, types};
};

describe('syncCallClientToStore', () => {
    let client: FakeCallClient;
    let store: ReturnType<typeof makeStore>;

    const sync = (options?: CallStoreSyncOptions) => syncCallClientToStore(client.asCallClient(), store.store as never, options);

    beforeEach(() => {
        client = installFakeCallClient();
        store = makeStore();
    });

    afterEach(() => {
        window.callsClient = undefined;
    });

    test('syncs mute, unmute and camera changes for the client\'s channel', () => {
        sync();

        client.emit(CALL_EVENT.MUTE, 'session-1', 'user-1');
        client.emit(CALL_EVENT.UNMUTE, 'session-1', 'user-1');
        client.setCamera('session-1', {state: CameraState.Ready, track: null});

        expect(store.actions).toEqual([
            expect.objectContaining({type: USER_MUTED, data: expect.objectContaining({channelID: 'channel-id', session_id: 'session-1'})}),
            expect.objectContaining({type: USER_UNMUTED, data: expect.objectContaining({channelID: 'channel-id', session_id: 'session-1'})}),
            expect.objectContaining({type: USER_CAMERA_ON, data: expect.objectContaining({channelID: 'channel-id', session_id: 'session-1'})}),
        ]);
    });

    test('syncs a camera turning off', () => {
        sync();

        client.setCamera('session-1', {state: CameraState.Off, track: null});

        expect(store.actions).toEqual([{type: USER_CAMERA_OFF, data: {channelID: 'channel-id', session_id: 'session-1', userID: 'user-session-1'}}]);
    });

    test('reads the channel from getClient when each event arrives', () => {
        let current: FakeCallClient | undefined = client;
        sync({getClient: () => current?.asCallClient()});

        current = undefined;
        client.emit(CALL_EVENT.MUTE, 'session-1', 'user-1');

        expect(store.actions[0].data.channelID).toBe('');
    });

    test('syncs only mute and camera changes without the room state', () => {
        sync({roomState: false, captions: false, callState: false});

        client.emit(CALL_EVENT.LOWER_HAND, 'session-1', 'user-1');
        client.emit(CALL_EVENT.SCREEN_SHARING_CHANGED, null);
        client.emit(CALL_EVENT.CAPTION, 'session-1', 'user-1', 'hello');
        client.emit(CALL_EVENT.MUTE, 'session-1', 'user-1');

        expect(store.types()).toEqual([USER_MUTED]);
    });

    test('syncs the room state, captions and call state by default', () => {
        sync();

        client.emit(CALL_EVENT.LOWER_HAND, 'session-1', 'user-1');
        client.emit(CALL_EVENT.CAPTION, sharer.session_id, sharer.user_id, 'hello');
        client.emit(CALL_EVENT.CALL_STATE, {id: 'call-id', start_at: 1, owner_id: 'me', sessions: [], thread_id: ''});
        client.emit(CALL_EVENT.JOB_STATE, {type: 'recording', start_at: 1});
        client.emit(CALL_EVENT.SIP_STATUS_CHANGED, 'ringing');

        expect(store.types()).toEqual(expect.arrayContaining([USER_HAND_LOWERED, LIVE_CAPTION, CALL_STATE, CALL_RECORDING_STATE, PHONE_LEG_STATUS_CHANGED]));
    });

    test.each([
        ['captions', {captions: false}, CALL_EVENT.CAPTION, [sharer.session_id, sharer.user_id, 'hello'], LIVE_CAPTION],
        ['call state', {callState: false}, CALL_EVENT.JOB_STATE, [{type: 'recording', start_at: 1}], CALL_RECORDING_STATE],
        ['the phone leg', {callState: false}, CALL_EVENT.SIP_STATUS_CHANGED, ['ringing'], PHONE_LEG_STATUS_CHANGED],
    ])('can leave out %s', (_, options: CallStoreSyncOptions, event, args, type) => {
        sync(options);

        client.emit(event, ...args);

        expect(store.types()).not.toContain(type);
    });

    test.each([
        ['a sharer the store knows', true],
        ['no sharer in the store', false],
    ])('clears screen sharing with %s when nobody shares', (_, withSharer) => {
        store = makeStore({withSharer});
        sync();

        client.setScreenShare(null);

        expect(store.actions).toEqual([{type: SCREEN_SHARING_CLEARED, data: {channelID: 'channel-id'}}]);
        expect(store.store.getState()['plugins-com.mattermost.calls'].screenSharingIDs).toEqual({});
    });

    test.each([
        ['a remote', false],
        ['a local', true],
    ])('starts screen sharing for %s session that shares', (_, isLocal) => {
        sync();

        client.setScreenShare({sessionID: 'session-1', userID: 'user-1', isLocal, track: null});

        expect(store.actions).toContainEqual({type: USER_SCREEN_ON, data: {channelID: 'channel-id', session_id: 'session-1', userID: 'user-1'}});
    });

    test.each([
        ['voice activity', CALL_EVENT.USERS_VOICE_ACTIVITY_CHANGED, [['session-1'], ['user-1']], {type: USERS_VOICE_ACTIVITY_CHANGED, data: {channelID: 'channel-id', session_ids: ['session-1'], userIDs: ['user-1']}}],
        ['a raised hand', CALL_EVENT.RAISE_HAND, ['session-1', 'user-1', 42], {type: USER_HAND_RAISED, data: {channelID: 'channel-id', session_id: 'session-1', userID: 'user-1', raised_hand: 42}}],
        ['a user leaving', CALL_EVENT.USER_LEFT, ['session-1', 'user-1'], {type: USER_LEFT, data: expect.objectContaining({channelID: 'channel-id', session_id: 'session-1', userID: 'user-1'})}],
        ['a host change', CALL_EVENT.HOST_CHANGED, ['user-1'], {type: CALL_HOST, data: expect.objectContaining({channelID: 'channel-id', hostID: 'user-1'})}],
    ])('syncs %s', (_, event, args, action) => {
        sync();

        client.emit(event, ...args);

        expect(store.actions).toContainEqual(action);
    });

    test('syncs a user joining', () => {
        sync();

        client.emit(CALL_EVENT.USER_JOINED, 'session-1', 'user-1', true);

        expect(store.types()).toEqual(expect.arrayContaining([USER_JOINED, USER_JOINED_TIMEOUT]));
    });

    test('syncs a reaction in the current call', () => {
        jest.useFakeTimers();
        sync();

        client.emit(CALL_EVENT.REACTION, 'session-1', 'user-1', {name: 'smile', unified: '1f604'}, 7);
        jest.runAllTimers();
        jest.useRealTimers();

        expect(store.types()).toEqual(expect.arrayContaining([USER_REACTED, USER_REACTED_TIMEOUT]));
        expect(store.actions).toContainEqual(expect.objectContaining({
            type: USER_REACTED,
            data: expect.objectContaining({session_id: 'session-1', reaction: expect.objectContaining({timestamp: 7, emoji: {name: 'smile', unified: '1f604'}})}),
        }));
    });

    test('stops syncing every event once unsubscribed', () => {
        const unsubscribe = sync();

        unsubscribe();

        expect(client.eventNames().filter((event) => client.listenerCount(event) > 0)).toEqual([]);
    });
});
