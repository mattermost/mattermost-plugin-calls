// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {UserProfile} from '@mattermost/types/users';
import {render} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {loadProfilesByIdsIfMissing} from 'src/actions';
import {
    channelForCurrentCall,
    dmCalleeAnsweredAtForCurrentCall,
    isCurrentDMCallInCallingState,
    otherUserIDForCurrentDMCall,
} from 'src/selectors';
import {mockStore} from 'src/testUtils';

import {useDMCallingState} from './use_dm_calling_state';

jest.mock('src/selectors', () => ({
    channelForCurrentCall: jest.fn(),
    dmCalleeAnsweredAtForCurrentCall: jest.fn(),
    isCurrentDMCallInCallingState: jest.fn(),
    otherUserIDForCurrentDMCall: jest.fn(),
}));

jest.mock('src/actions', () => ({
    loadProfilesByIdsIfMissing: jest.fn((ids) => ({type: 'loadProfilesByIdsIfMissing', ids})),
}));

const calleeID = 'callee-user-id';
const callee = {id: calleeID, username: 'callee'} as UserProfile;

const mock = (fn: unknown) => fn as jest.Mock;

type Opts = {
    isDM?: boolean;
    isCalling?: boolean;
    otherUserID?: string;
    answeredAt?: number;
    profileLoaded?: boolean;
};

// renderHook doesn't work under this jest setup, so a probe component reports what the hook
// returned instead.
const renderHookState = ({isDM = true, isCalling = false, otherUserID = calleeID, answeredAt = 0, profileLoaded = true}: Opts = {}) => {
    mock(channelForCurrentCall).mockReturnValue(isDM ? ({type: 'D'} as Channel) : undefined);
    mock(isCurrentDMCallInCallingState).mockReturnValue(isCalling);
    mock(otherUserIDForCurrentDMCall).mockReturnValue(otherUserID);
    mock(dmCalleeAnsweredAtForCurrentCall).mockReturnValue(answeredAt);

    let state: ReturnType<typeof useDMCallingState> | undefined;

    const Probe = () => {
        state = useDMCallingState();
        return null;
    };

    const store = mockStore({
        entities: {
            users: {
                currentUserId: 'my-user-id',
                profiles: profileLoaded ? {[calleeID]: callee} : {},
            },
        },
    });
    const dispatch = jest.spyOn(store, 'dispatch');

    render(
        <Provider store={store}>
            <Probe/>
        </Provider>,
    );

    return {state: state as ReturnType<typeof useDMCallingState>, dispatch};
};

describe('useDMCallingState', () => {
    test('should report a ringing DM call along with who is being called', () => {
        const {state} = renderHookState({isCalling: true});

        expect(state).toEqual({
            isDM: true,
            isDMCalling: true,
            dmCalleeID: calleeID,
            dmCallee: callee,

            // eslint-disable-next-line no-undefined
            dmCalleeAnsweredAt: undefined,
        });
    });

    test('should fetch the callee profile, which no call session names yet', () => {
        const {dispatch} = renderHookState({isCalling: true, profileLoaded: false});

        expect(loadProfilesByIdsIfMissing).toHaveBeenCalledWith([calleeID]);
        expect(dispatch).toHaveBeenCalledWith({type: 'loadProfilesByIdsIfMissing', ids: [calleeID]});
    });

    test('should not report a ringing call when the other party is unknown', () => {
        const {state} = renderHookState({isCalling: true, otherUserID: ''});

        expect(state.isDMCalling).toBe(false);
        expect(state.dmCalleeID).toBeUndefined();
        expect(loadProfilesByIdsIfMissing).not.toHaveBeenCalled();
    });

    test('should keep reporting the callee once they have answered', () => {
        const {state} = renderHookState({isCalling: false, answeredAt: 1234});

        expect(state).toEqual({
            isDM: true,
            isDMCalling: false,
            dmCalleeID: calleeID,
            dmCallee: callee,
            dmCalleeAnsweredAt: 1234,
        });
    });

    test('should report nothing outside a DM call', () => {
        const {state} = renderHookState({isDM: false});

        expect(state).toEqual({
            isDM: false,
            isDMCalling: false,

            /* eslint-disable no-undefined */
            dmCalleeID: undefined,
            dmCallee: undefined,
            dmCalleeAnsweredAt: undefined,

            /* eslint-enable no-undefined */
        });
    });
});
