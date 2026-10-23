// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {Team} from '@mattermost/types/teams';
import {act, render} from '@testing-library/react';
import {createMemoryHistory} from 'history';
import {getChannelsNameMapInCurrentTeam} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeam} from 'mattermost-redux/selectors/entities/teams';
import React from 'react';
import {Provider} from 'react-redux';
import {Router} from 'react-router-dom';
import {mockStore} from 'src/testUtils';

import JoinCallWatcher from './join_call_watcher';

jest.mock('mattermost-redux/selectors/entities/channels', () => ({
    getChannel: (state: {entities: {channels: {channels: Record<string, unknown>}}}, id: string) =>
        state?.entities?.channels?.channels?.[id],
    getChannelsNameMapInCurrentTeam: jest.fn(),
}));

jest.mock('mattermost-redux/selectors/entities/teams', () => ({
    getCurrentTeam: jest.fn(),
}));

const team1 = {id: 'team-1-id', name: 'team-1'} as Team;
const townSquare = {id: 'town-square-id', name: 'town-square'} as Channel;
const offTopic = {id: 'off-topic-id', name: 'off-topic'} as Channel;

type RenderOpts = {
    path: string;
    channelsById?: Record<string, Channel>;
    channelsByName?: Record<string, Channel>;
    currentTeam?: Team | null; // null means explicitly no current team
};

const renderWatcher = ({
    path,
    channelsById = {},
    channelsByName = {},
    currentTeam = team1,
}: RenderOpts) => {
    const onJoinCall = jest.fn();
    const history = createMemoryHistory({initialEntries: [path]});
    const store = mockStore({
        entities: {
            channels: {
                channels: channelsById,
            },
        },
    });
    (getChannelsNameMapInCurrentTeam as jest.Mock).mockReturnValue(channelsByName);

    // null passes through fine — null?.name in the watcher is the same as undefined?.name.
    (getCurrentTeam as jest.Mock).mockReturnValue(currentTeam);

    const result = render(
        <Provider store={store}>
            <Router history={history}>
                <JoinCallWatcher onJoinCall={onJoinCall}/>
            </Router>
        </Provider>,
    );

    return {onJoinCall, history, ...result};
};

describe('JoinCallWatcher', () => {
    it('does nothing when join_call param is absent', () => {
        const {onJoinCall} = renderWatcher({
            path: '/team-1/channels/town-square',
            channelsByName: {'town-square': townSquare},
        });
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('does nothing when join_call is not "true"', () => {
        const {onJoinCall} = renderWatcher({
            path: '/team-1/channels/town-square?join_call=false',
            channelsByName: {'town-square': townSquare},
        });
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('joins via channel ID when URL pathname is in ID form', () => {
        const {onJoinCall} = renderWatcher({
            path: '/team-1/channels/town-square-id?join_call=true',
            channelsById: {'town-square-id': townSquare},
            channelsByName: {'town-square': townSquare},
        });
        expect(onJoinCall).toHaveBeenCalledTimes(1);
        expect(onJoinCall).toHaveBeenCalledWith('town-square-id');
    });

    it('joins via channel ID when URL pathname is in canonical name form', () => {
        const {onJoinCall} = renderWatcher({
            path: '/team-1/channels/town-square?join_call=true',
            channelsByName: {'town-square': townSquare},
        });
        expect(onJoinCall).toHaveBeenCalledTimes(1);
        expect(onJoinCall).toHaveBeenCalledWith('town-square-id');
    });

    it('does nothing when the URL channel is not loaded in Redux', () => {
        const {onJoinCall} = renderWatcher({
            path: '/team-1/channels/unknown-channel?join_call=true',
            channelsById: {},
            channelsByName: {},
        });
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('does nothing when pathname does not match /channels/<...>', () => {
        const {onJoinCall} = renderWatcher({
            path: '/team-1/messages/@somebody?join_call=true',
            channelsByName: {'town-square': townSquare},
        });
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('does nothing when URL team does not match current team', () => {
        // Cross-team link: another team has a channel with the same name as
        // ours. Without the team check we would mis-resolve and join the wrong
        // call in the current team.
        const {onJoinCall} = renderWatcher({
            path: '/other-team/channels/town-square?join_call=true',
            channelsByName: {'town-square': townSquare},
            currentTeam: team1,
        });
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('does nothing when there is no current team yet', () => {
        const {onJoinCall} = renderWatcher({
            path: '/team-1/channels/town-square?join_call=true',
            channelsByName: {'town-square': townSquare},
            currentTeam: null,
        });
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('joins exactly once across cross-channel navigation + canonicalization', () => {
        // Simulates the real cross-channel flow: navigate to /channels/<id>?join_call=true,
        // then the webapp canonicalizes to /channels/<name> and strips the param.
        const {onJoinCall, history} = renderWatcher({
            path: '/team-1/channels/off-topic',
            channelsById: {
                'town-square-id': townSquare,
                'off-topic-id': offTopic,
            },
            channelsByName: {'town-square': townSquare, 'off-topic': offTopic},
        });

        act(() => {
            history.push('/team-1/channels/town-square-id?join_call=true');
        });
        expect(onJoinCall).toHaveBeenCalledTimes(1);
        expect(onJoinCall).toHaveBeenCalledWith('town-square-id');

        act(() => {
            history.replace('/team-1/channels/town-square');
        });
        expect(onJoinCall).toHaveBeenCalledTimes(1); // not called again
    });

    it('joins again when navigating to a different channel with the param', () => {
        const {onJoinCall, history} = renderWatcher({
            path: '/team-1/channels/town-square?join_call=true',
            channelsById: {
                'town-square-id': townSquare,
                'off-topic-id': offTopic,
            },
            channelsByName: {'town-square': townSquare, 'off-topic': offTopic},
        });
        expect(onJoinCall).toHaveBeenCalledTimes(1);
        expect(onJoinCall).toHaveBeenLastCalledWith('town-square-id');

        act(() => {
            history.replace('/team-1/channels/town-square'); // canonicalization
            history.push('/team-1/channels/off-topic-id?join_call=true');
        });
        expect(onJoinCall).toHaveBeenCalledTimes(2);
        expect(onJoinCall).toHaveBeenLastCalledWith('off-topic-id');
    });
});
