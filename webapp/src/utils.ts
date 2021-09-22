import {
    getCurrentRelativeTeamUrl,
    getCurrentTeam,
    getCurrentTeamId,
    getTeam,
    getTeamByName,
    getTeamMemberships,
} from 'mattermost-redux/selectors/entities/teams';

import {id as pluginId} from 'manifest';

export function getPluginPath() {
    return window.basename ? `${window.basename}/plugins/${pluginId}` :
        `/plugins/${pluginId}`;
}

export function getWSConnectionURL(channelID: string): string {
    const loc = window.location;
    const uri = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${uri}//${loc.host}${getPluginPath()}/${channelID}/ws`;
}

export function getTeamRelativeUrl(team) {
    if (!team) {
        return '';
    }

    return '/' + team.name;
}

export function getChannelURL(state, channel, teamId) {
    let notificationURL;
    if (channel && (channel.type === 'D' || channel.type === 'G')) {
        notificationURL = getCurrentRelativeTeamUrl(state) + '/channels/' + channel.name;
    } else if (channel) {
        const team = getTeam(state, teamId);
        notificationURL = getTeamRelativeUrl(team) + '/channels/' + channel.name;
    } else if (teamId) {
        const team = getTeam(state, teamId);
        const redirectChannel = getRedirectChannelNameForTeam(state, teamId);
        notificationURL = getTeamRelativeUrl(team) + `/channels/${redirectChannel}`;
    } else {
        const currentTeamId = getCurrentTeamId(state);
        const redirectChannel = getRedirectChannelNameForTeam(state, currentTeamId);
        notificationURL = getCurrentRelativeTeamUrl(state) + `/channels/${redirectChannel}`;
    }
    return notificationURL;
}

export function getUserDisplayName(user) {
    if (user.first_name && user.last_name) {
        return user.first_name + ' ' + user.last_name;
    }

    return user.username;
}
