// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {AnyAction, applyMiddleware, combineReducers, createStore, Middleware} from 'redux';
import {thunk} from 'redux-thunk';
import {CALL_RECORDING_STATE, CALL_STATE, LIVE_CAPTION} from 'src/action_types';
import {CALL_EVENT} from 'src/clients/call/constants';
import {CameraState} from 'src/clients/call/types';
import reducer from 'src/reducers';
import {USER_CAMERA_ON} from 'src/state/camera_on_ids/action_types';
import {PHONE_LEG_STATUS_CHANGED} from 'src/state/phone_legs/action_types';
import {USER_SCREEN_OFF} from 'src/state/screen_sharing_ids/action_types';
import {USER_HAND_LOWERED, USER_MUTED, USER_UNMUTED} from 'src/state/session/action_types';
import {FakeCallClient, installFakeCallClient} from 'src/test_utils/fake_call_client';

import {CallStoreSyncOptions, syncCallClientToStore} from './call_store_sync';

const sharer = {session_id: 'sharer-session', user_id: 'sharer', unmuted: false, raised_hand: 0};

const makeStore = () => {
    const actions: AnyAction[] = [];
    const record: Middleware = () => (next) => (action) => {
        actions.push(action as AnyAction);
        return next(action);
    };
    const store = createStore(
        combineReducers({
            'plugins-com.mattermost.calls': reducer,
            entities: (state = {users: {currentUserId: 'me', profiles: {}}, channels: {channels: {}}}) => state,
        }),
        {
            'plugins-com.mattermost.calls': {
                sessions: {'channel-id': {[sharer.session_id]: sharer}},
                screenSharingIDs: {'channel-id': sharer.session_id},
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
        client.emit(CALL_EVENT.CAMERA_CHANGED, 'session-1', 'user-1', CameraState.Ready);

        expect(store.actions).toEqual([
            expect.objectContaining({type: USER_MUTED, data: expect.objectContaining({channelID: 'channel-id', session_id: 'session-1'})}),
            expect.objectContaining({type: USER_UNMUTED, data: expect.objectContaining({channelID: 'channel-id', session_id: 'session-1'})}),
            expect.objectContaining({type: USER_CAMERA_ON, data: expect.objectContaining({channelID: 'channel-id', session_id: 'session-1'})}),
        ]);
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
        ['the sharer the store knows', true, sharer.session_id],
        ['no session', false, ''],
    ])('ends screen sharing for %s', (_, unshareStoreSharer, sessionID) => {
        sync({unshareStoreSharer});

        client.emit(CALL_EVENT.SCREEN_SHARING_CHANGED, null);

        expect(store.actions).toContainEqual(expect.objectContaining({type: USER_SCREEN_OFF, data: expect.objectContaining({session_id: sessionID})}));
    });

    test('stops syncing every event once unsubscribed', () => {
        const unsubscribe = sync();

        unsubscribe();

        expect(client.eventNames().filter((event) => client.listenerCount(event) > 0)).toEqual([]);
    });
});
