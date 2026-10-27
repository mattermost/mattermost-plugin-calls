// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {Team} from '@mattermost/types/teams';
import {render} from '@testing-library/react';
import {createMemoryHistory} from 'history';
import {getChannelsNameMapInCurrentTeam} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeam} from 'mattermost-redux/selectors/entities/teams';
import React from 'react';
import {Provider} from 'react-redux';
import {Router} from 'react-router-dom';
import {mockStore} from 'src/testUtils';

import JoinCallWatcher from './components/join_call_watcher';
import {makeJoinCallFromLink} from './join_call_from_link';

jest.mock('mattermost-redux/selectors/entities/channels', () => ({
    getChannel: jest.fn(),
    getChannelsNameMapInCurrentTeam: jest.fn(),
}));

jest.mock('mattermost-redux/selectors/entities/teams', () => ({
    getCurrentTeam: jest.fn(),
}));

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('makeJoinCallFromLink', () => {
    it('does not join until the initial state has loaded', async () => {
        let resolveLoaded: () => void = () => {};
        const initialStateLoaded = new Promise<void>((resolve) => {
            resolveLoaded = resolve;
        });
        const joinCall = jest.fn().mockResolvedValue(undefined);
        const joinCallFromLink = makeJoinCallFromLink(initialStateLoaded, joinCall, jest.fn());

        // The watcher resolves the URL's channel before fetchChannels finishes.
        const team = {id: 'team-1-id', name: 'team-1'} as Team;
        const townSquare = {id: 'town-square-id', name: 'town-square'} as Channel;
        (getCurrentTeam as jest.Mock).mockReturnValue(team);
        (getChannelsNameMapInCurrentTeam as jest.Mock).mockReturnValue({'town-square': townSquare});

        render(
            <Provider store={mockStore({})}>
                <Router history={createMemoryHistory({initialEntries: ['/team-1/channels/town-square?join_call=true']})}>
                    <JoinCallWatcher onJoinCall={joinCallFromLink}/>
                </Router>
            </Provider>,
        );

        await flushPromises();
        expect(joinCall).not.toHaveBeenCalled();

        resolveLoaded();
        await flushPromises();
        expect(joinCall).toHaveBeenCalledTimes(1);
        expect(joinCall).toHaveBeenCalledWith('town-square-id');
    });

    it('reports join errors through onError', async () => {
        const err = new Error('boom');
        const onError = jest.fn();
        const joinCallFromLink = makeJoinCallFromLink(Promise.resolve(), jest.fn().mockRejectedValue(err), onError);

        await joinCallFromLink('channel-id');

        expect(onError).toHaveBeenCalledWith(err);
    });
});
