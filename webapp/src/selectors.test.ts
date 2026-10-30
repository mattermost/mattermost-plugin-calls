// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel, ChannelType} from '@mattermost/types/channels';
import {GlobalState} from '@mattermost/types/store';

import {pluginId} from './manifest';
import {hasPermissionsToEnableCalls} from './selectors';

const CHANNEL_ID = 'channel-id';
const TEAM_ID = 'team-id';
const USER_ID = 'user-id';

const makeChannel = (type: ChannelType) => ({
    id: CHANNEL_ID,
    team_id: type === 'D' || type === 'G' ? '' : TEAM_ID,
    type,
} as Channel);

const makeState = ({
    channel = makeChannel('O'),
    teamRoles,
}: {
    channel?: Channel;
    teamRoles?: string;
} = {}) => ({
    entities: {
        users: {
            currentUserId: USER_ID,
            profiles: {[USER_ID]: {id: USER_ID, roles: 'system_user'}},
        },
        channels: {
            channels: {[channel.id]: channel},
            myMembers: {[channel.id]: {channel_id: channel.id, user_id: USER_ID, roles: 'channel_user', scheme_admin: false}},
            roles: {[channel.id]: new Set(['channel_user'])},
        },
        teams: {
            myMembers: teamRoles ? {[TEAM_ID]: {team_id: TEAM_ID, user_id: USER_ID, roles: teamRoles}} : {},
        },
    },
    [`plugins-${pluginId}`]: {
        callsConfig: {DefaultEnabled: true},
    },
} as unknown as GlobalState);

describe('hasPermissionsToEnableCalls', () => {
    it('returns false without throwing when team roles are not loaded', () => {
        expect(hasPermissionsToEnableCalls(makeState(), CHANNEL_ID)).toBe(false);
    });

    it('returns true for a team admin', () => {
        expect(hasPermissionsToEnableCalls(makeState({teamRoles: 'team_user team_admin'}), CHANNEL_ID)).toBe(true);
    });

    it('returns true in a DM', () => {
        const channel = makeChannel('D');
        expect(hasPermissionsToEnableCalls(makeState({channel}), CHANNEL_ID)).toBe(true);
    });
});
