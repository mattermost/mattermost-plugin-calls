import {
    getCurrentRelativeTeamUrl,
    getCurrentTeam,
    getCurrentTeamId,
    getTeam,
    getTeamByName,
    getTeamMemberships,
} from 'mattermost-redux/selectors/entities/teams';

import {Client4} from 'mattermost-redux/client';

import {getRedirectChannelNameForTeam} from 'mattermost-redux/selectors/entities/channels';
import {isDirectChannel, isGroupChannel} from 'mattermost-redux/utils/channel_utils';

import {Team} from 'mattermost-redux/types/teams';
import {Channel} from 'mattermost-redux/types/channels';
import {UserProfile} from 'mattermost-redux/types/users';
import {Dictionary} from 'mattermost-redux/types/utilities';

import {GlobalState} from 'mattermost-redux/types/store';

import {UserState} from './types/types';

import {id as pluginId} from './manifest';

export function getPluginStaticPath() {
    return window.basename ? `${window.basename}/static/plugins/${pluginId}` :
        `/static/plugins/${pluginId}`;
}

export function getPluginPath() {
    return window.basename ? `${window.basename}/plugins/${pluginId}` :
        `/plugins/${pluginId}`;
}

export function getWSConnectionURL(): string {
    const loc = window.location;
    const uri = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${uri}//${loc.host}${Client4.getUrlVersion()}/websocket`;
}

export function getPluginWSConnectionURL(channelID: string): string {
    const loc = window.location;
    const uri = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${uri}//${loc.host}${getPluginPath()}/${channelID}/ws`;
}

export function getTeamRelativeUrl(team: Team) {
    if (!team) {
        return '';
    }

    return '/' + team.name;
}

export function getChannelURL(state: GlobalState, channel: Channel, teamId: string) {
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

export function getUserDisplayName(user: UserProfile) {
    if (user.first_name && user.last_name) {
        return user.first_name + ' ' + user.last_name;
    }

    return user.username;
}

export function getPixelRatio(): number {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    if (!ctx) {
        canvas.remove();
        return dpr;
    }
    const bsr = ctx.webkitBackingStorePixelRatio ||
    ctx.mozBackingStorePixelRatio ||
    ctx.msBackingStorePixelRatio ||
    ctx.oBackingStorePixelRatio ||
    ctx.backingStorePixelRatio || 1;
    canvas.remove();
    return dpr / bsr;
}

export function getScreenResolution() {
    const pixelRatio = getPixelRatio();
    const width = Math.ceil((pixelRatio * window.screen.width) / 8.0) * 8;
    const height = Math.ceil((pixelRatio * window.screen.height) / 8.0) * 8;
    return {
        width,
        height,
    };
}

type userRoles = {
    system: Set<string>;
    team: Dictionary<Set<string>>;
    channel: Dictionary<Set<string>>;
}

export function hasPermissionsToEnableCalls(channel: Channel, roles: userRoles, allowEnable: boolean) {
    if (!allowEnable) {
        return roles.system.has('system_admin');
    }

    return (isDirectChannel(channel) ||
    isGroupChannel(channel)) ||
    roles.channel[channel.id].has('channel_admin') ||
    roles.system.has('system_admin');
}

export function getExpandedChannelID() {
    const pattern = `${pluginId}/expanded/`;
    const idx = window.location.pathname.indexOf(pattern);
    if (idx < 0) {
        return '';
    }
    return window.location.pathname.substr(idx + pattern.length);
}

export function alphaSortProfiles(profiles: UserProfile[]) {
    return (elA: UserProfile, elB: UserProfile) => {
        const nameA = getUserDisplayName(elA);
        const nameB = getUserDisplayName(elB);
        return nameA.localeCompare(nameB);
    };
}

export function stateSortProfiles(profiles: UserProfile[], statuses: {[key: string]: UserState}, presenterID: string) {
    return (elA: UserProfile, elB: UserProfile) => {
        let stateA = statuses[elA.id];
        let stateB = statuses[elB.id];

        if (elA.id === presenterID) {
            return -1;
        } else if (elB.id === presenterID) {
            return 1;
        }

        if (!stateA) {
            stateA = {
                voice: false,
                unmuted: false,
                raised_hand: 0,
            };
        }
        if (!stateB) {
            stateB = {
                voice: false,
                unmuted: false,
                raised_hand: 0,
            };
        }

        if (stateA.unmuted && !stateB.unmuted) {
            return -1;
        } else if (stateB.unmuted && !stateA.unmuted) {
            return 1;
        }

        if (stateA.raised_hand && !stateB.raised_hand) {
            return -1;
        } else if (stateB.raised_hand && !stateA.raised_hand) {
            return 1;
        } else if (stateA.raised_hand && stateB.raised_hand) {
            return stateA.raised_hand - stateB.raised_hand;
        }

        return 0;
    };
}

export async function getScreenStream(): Promise<MediaStream|null> {
    let screenStream: MediaStream;
    const resolution = getScreenResolution();
    console.log(resolution);

    const maxFrameRate = 15;
    const captureWidth = (resolution.width / 8) * 5;

    try {
        // browser
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                frameRate: maxFrameRate,
                width: captureWidth,
            },
            audio: false,
        });
    } catch (err) {
        console.log(err);
        try {
            // electron
            screenStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        minWidth: captureWidth,
                        maxWidth: captureWidth,
                        maxFrameRate,
                    },
                } as any,
            });
        } catch (err2) {
            console.log(err2);
            return null;
        }
    }

    return screenStream;
}

export function isDMChannel(channel: Channel) {
    return channel.type === 'D';
}

export function isGMChannel(channel: Channel) {
    return channel.type === 'G';
}

export function isPublicChannel(channel: Channel) {
    return channel.type === 'O';
}

export function isPrivateChannel(channel: Channel) {
    return channel.type === 'P';
}
