// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {act, render} from '@testing-library/react';
import {createMemoryHistory} from 'history';
import {getChannelsNameMapInCurrentTeam} from 'mattermost-redux/selectors/entities/channels';
import React from 'react';
import {Provider} from 'react-redux';
import {Router} from 'react-router-dom';
import {mockStore} from 'src/testUtils';

import JoinCallWatcher from './join_call_watcher';

jest.mock('mattermost-redux/selectors/entities/channels', () => ({
    getChannelsNameMapInCurrentTeam: jest.fn(),
}));

const townSquare = {id: 'town-square-id', name: 'town-square'} as Channel;
const offTopic = {id: 'off-topic-id', name: 'off-topic'} as Channel;

type RenderOpts = {
    path: string;
    channelsById?: Record<string, Channel>;
    channelsByName?: Record<string, Channel>;
};

const renderWatcher = ({path, channelsById = {}, channelsByName = {}}: RenderOpts) => {
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
            path: '/team/channels/town-square',
            channelsByName: {'town-square': townSquare},
        });
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('does nothing when join_call is not "true"', () => {
        const {onJoinCall} = renderWatcher({
            path: '/team/channels/town-square?join_call=false',
            channelsByName: {'town-square': townSquare},
        });
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('joins via channel ID when URL pathname is in ID form', () => {
        const {onJoinCall} = renderWatcher({
            path: '/team/channels/town-square-id?join_call=true',
            channelsById: {'town-square-id': townSquare},
            channelsByName: {'town-square': townSquare},
        });
        expect(onJoinCall).toHaveBeenCalledTimes(1);
        expect(onJoinCall).toHaveBeenCalledWith('town-square-id');
    });

    it('joins via channel ID when URL pathname is in canonical name form', () => {
        const {onJoinCall} = renderWatcher({
            path: '/team/channels/town-square?join_call=true',
            channelsByName: {'town-square': townSquare},
        });
        expect(onJoinCall).toHaveBeenCalledTimes(1);
        expect(onJoinCall).toHaveBeenCalledWith('town-square-id');
    });

    it('does nothing when the URL channel is not loaded in Redux', () => {
        const {onJoinCall} = renderWatcher({
            path: '/team/channels/unknown-channel?join_call=true',
            channelsById: {},
            channelsByName: {},
        });
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('does nothing when pathname does not match /channels/<...>', () => {
        const {onJoinCall} = renderWatcher({
            path: '/team/messages/@somebody?join_call=true',
            channelsByName: {'town-square': townSquare},
        });
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('joins exactly once across cross-channel navigation + canonicalization', () => {
        // Simulates the real cross-channel flow: navigate to /channels/<id>?join_call=true,
        // then the webapp canonicalizes to /channels/<name> and strips the param.
        const {onJoinCall, history} = renderWatcher({
            path: '/team/channels/off-topic',
            channelsById: {
                'town-square-id': townSquare,
                'off-topic-id': offTopic,
            },
            channelsByName: {'town-square': townSquare, 'off-topic': offTopic},
        });

        act(() => {
            history.push('/team/channels/town-square-id?join_call=true');
        });
        expect(onJoinCall).toHaveBeenCalledTimes(1);
        expect(onJoinCall).toHaveBeenCalledWith('town-square-id');

        act(() => {
            history.replace('/team/channels/town-square');
        });
        expect(onJoinCall).toHaveBeenCalledTimes(1); // not called again
    });

    it('joins again when navigating to a different channel with the param', () => {
        const {onJoinCall, history} = renderWatcher({
            path: '/team/channels/town-square?join_call=true',
            channelsById: {
                'town-square-id': townSquare,
                'off-topic-id': offTopic,
            },
            channelsByName: {'town-square': townSquare, 'off-topic': offTopic},
        });
        expect(onJoinCall).toHaveBeenCalledTimes(1);
        expect(onJoinCall).toHaveBeenLastCalledWith('town-square-id');

        act(() => {
            history.replace('/team/channels/town-square'); // canonicalization
            history.push('/team/channels/off-topic-id?join_call=true');
        });
        expect(onJoinCall).toHaveBeenCalledTimes(2);
        expect(onJoinCall).toHaveBeenLastCalledWith('off-topic-id');
    });
});
