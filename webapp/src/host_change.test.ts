// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId, getUser} from 'mattermost-redux/selectors/entities/users';
import {CALL_HOST, HOST_CONTROL_NOTICE} from 'src/action_types';
import {applyCallHostChanged} from 'src/host_change';
import {channelHasCall, hostIDForCallInChannel, profilesInCurrentCallMap} from 'src/selectors';

jest.mock('src/selectors', () => ({
    channelHasCall: jest.fn(),
    hostIDForCallInChannel: jest.fn(),
    profilesInCurrentCallMap: jest.fn(),
}));
jest.mock('src/utils', () => ({
    getUserDisplayName: jest.fn(() => 'Host User'),
    isDMChannel: jest.fn(() => false),
}));
jest.mock('mattermost-redux/selectors/entities/channels', () => ({
    getChannel: jest.fn(),
}));
jest.mock('mattermost-redux/selectors/entities/users', () => ({
    getCurrentUserId: jest.fn(),
    getUser: jest.fn(),
}));
jest.mock('mattermost-redux/utils/helpers', () => ({
    generateId: jest.fn(() => 'notice-id'),
}));

describe('applyCallHostChanged', () => {
    const dispatch = jest.fn();
    const store = {dispatch, getState: jest.fn(() => ({}) as never)};

    beforeEach(() => {
        jest.clearAllMocks();
        (getCurrentUserId as jest.Mock).mockReturnValue('me');
        (getChannel as jest.Mock).mockReturnValue({id: 'ch'});
        (channelHasCall as jest.Mock).mockReturnValue(true);
        (profilesInCurrentCallMap as jest.Mock).mockReturnValue({});
        (getUser as jest.Mock).mockReturnValue({id: 'host1'});
    });

    it('does nothing when the host is unchanged', () => {
        (hostIDForCallInChannel as jest.Mock).mockReturnValue('host1');

        applyCallHostChanged(store, 'ch', 'host1', 'call1');

        expect(dispatch).not.toHaveBeenCalled();
    });

    it('announces a real host change', () => {
        (hostIDForCallInChannel as jest.Mock).mockReturnValue('host0');

        applyCallHostChanged(store, 'ch', 'host1', 'call1');

        const types = dispatch.mock.calls.map((c) => c[0].type);
        expect(types).toEqual([CALL_HOST, HOST_CONTROL_NOTICE]);
    });

    it('announces the first host seen for a call', () => {
        (hostIDForCallInChannel as jest.Mock).mockReturnValue(undefined);

        applyCallHostChanged(store, 'ch', 'host1', 'call1');

        const types = dispatch.mock.calls.map((c) => c[0].type);
        expect(types).toEqual([CALL_HOST, HOST_CONTROL_NOTICE]);
    });
});
