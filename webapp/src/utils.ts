import {parseSemVer} from 'semver-parser';

import {
    getCurrentRelativeTeamUrl,
    getCurrentTeamId,
    getTeam,
} from 'mattermost-redux/selectors/entities/teams';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {Client4} from 'mattermost-redux/client';

import {getRedirectChannelNameForTeam} from 'mattermost-redux/selectors/entities/channels';
import {setThreadFollow} from 'mattermost-redux/actions/threads';

import {Team} from '@mattermost/types/teams';
import {Channel} from '@mattermost/types/channels';
import {UserProfile} from '@mattermost/types/users';

import {GlobalState} from '@mattermost/types/store';
import {ClientConfig} from '@mattermost/types/config';

import {UserState} from './types/types';

import {pluginId} from './manifest';
import {logErr, logDebug} from './log';

import {
    voiceChannelRootPost,
} from './selectors';

import {Store} from './types/mattermost-webapp';

import LeaveSelfSound from './sounds/leave_self.mp3';
import JoinUserSound from './sounds/join_user.mp3';
import JoinSelfSound from './sounds/join_self.mp3';

export function getPluginStaticPath() {
    return `${window.basename || ''}/static/plugins/${pluginId}`;
}

export function getPluginPath() {
    return `${window.basename || ''}/plugins/${pluginId}`;
}

export function getWSConnectionURL(config: Partial<ClientConfig>): string {
    const loc = window.location;
    const uri = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const baseURL = config && config.WebsocketURL ? config.WebsocketURL : `${uri}//${loc.host}${window.basename || ''}`;

    return `${baseURL}${Client4.getUrlVersion()}/websocket`;
}

export function getTeamRelativeURL(team: Team) {
    if (!team) {
        return '';
    }

    return `/${team.name}`;
}

export function getPopOutURL(team: Team, channel: Channel) {
    return `${window.basename || ''}/${team.name}/${pluginId}/expanded/${channel.id}`;
}

export function getChannelURL(state: GlobalState, channel: Channel, teamId: string) {
    let channelURL;
    if (channel && (channel.type === 'D' || channel.type === 'G')) {
        channelURL = getCurrentRelativeTeamUrl(state) + '/channels/' + channel.name;
    } else if (channel) {
        const team = getTeam(state, teamId);
        channelURL = getTeamRelativeURL(team) + '/channels/' + channel.name;
    } else if (teamId) {
        const team = getTeam(state, teamId);
        const redirectChannel = getRedirectChannelNameForTeam(state, teamId);
        channelURL = getTeamRelativeURL(team) + `/channels/${redirectChannel}`;
    } else {
        const currentTeamId = getCurrentTeamId(state);
        const redirectChannel = getRedirectChannelNameForTeam(state, currentTeamId);
        channelURL = getCurrentRelativeTeamUrl(state) + `/channels/${redirectChannel}`;
    }
    return channelURL;
}

export function getUserDisplayName(user: UserProfile | undefined) {
    if (!user) {
        return '';
    }

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

export function getExpandedChannelID() {
    const pattern = `${pluginId}/expanded/`;
    const idx = window.location.pathname.indexOf(pattern);
    if (idx < 0) {
        return '';
    }
    return window.location.pathname.substr(idx + pattern.length);
}

export function getRecordingChannelID() {
    const pattern = `${pluginId}/recording/`;
    const idx = window.location.pathname.indexOf(pattern);
    if (idx < 0) {
        return '';
    }
    return window.location.pathname.substr(idx + pattern.length);
}

export function alphaSortProfiles(elA: UserProfile, elB: UserProfile) {
    const nameA = getUserDisplayName(elA);
    const nameB = getUserDisplayName(elB);
    return nameA.localeCompare(nameB);
}

export function stateSortProfiles(profiles: UserProfile[], statuses: { [key: string]: UserState }, presenterID: string, considerReaction = false) {
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
                id: elA.id,
                voice: false,
                unmuted: false,
                raised_hand: 0,
            };
        }
        if (!stateB) {
            stateB = {
                id: elB.id,
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

        if (considerReaction) {
            if (stateA.reaction && !stateB.reaction) {
                return -1;
            } else if (stateB.reaction && !stateA.reaction) {
                return 1;
            } else if (stateA.reaction && stateB.reaction) {
                return stateA.reaction.timestamp - stateB.reaction.timestamp;
            }
        }

        return 0;
    };
}

export async function getScreenStream(sourceID?: string, withAudio?: boolean): Promise<MediaStream | null> {
    let screenStream: MediaStream | null = null;

    if (window.desktop) {
        try {
            // electron
            const options = {
                chromeMediaSource: 'desktop',
            } as Record<string, unknown>;
            if (sourceID) {
                options.chromeMediaSourceId = sourceID;
            }
            screenStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    mandatory: options,
                } as Record<string, unknown>,
                audio: withAudio ? {mandatory: options} as Record<string, unknown> : false,
            });
        } catch (err) {
            logErr(err);
            return null;
        }
    } else {
        // browser
        try {
            // @ts-ignore (fixed in typescript 4.4+ but webapp is on 4.3.4)
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: Boolean(withAudio),
            });
        } catch (err) {
            logErr(err);
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

export async function getProfilesByIds(state: GlobalState, ids: string[]): Promise<UserProfile[]> {
    const profiles = [];
    const missingIds = [];
    for (const id of ids) {
        const profile = state.entities.users.profiles[id];
        if (profile) {
            profiles.push(profile);
        } else {
            missingIds.push(id);
        }
    }
    if (missingIds.length > 0) {
        profiles.push(...(await Client4.getProfilesByIds(missingIds)));
    }
    return profiles;
}

export function getUserIdFromDM(dmName: string, currentUserId: string) {
    const ids = dmName.split('__');
    let otherUserId = '';
    if (ids[0] === currentUserId) {
        otherUserId = ids[1];
    } else {
        otherUserId = ids[0];
    }
    return otherUserId;
}

export function setSDPMaxVideoBW(sdp: string, bandwidth: number) {
    let modifier = 'AS';
    if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1) {
        bandwidth = (bandwidth >>> 0) * 1000;
        modifier = 'TIAS';
    }
    if (sdp.indexOf('b=' + modifier + ':') === -1) {
        sdp = sdp.replaceAll(/m=video (.*)\r\n/gm, 'm=video $1\r\nb=' + modifier + ':' + bandwidth + '\r\n');
    } else {
        sdp = sdp.replace(new RegExp('b=' + modifier + ':.*\r\n'), 'b=' + modifier + ':' + bandwidth + '\r\n');
    }
    return sdp;
}

export function hasExperimentalFlag() {
    return window.localStorage.getItem('calls_experimental_features') === 'on';
}

export function getUsersList(profiles: UserProfile[]) {
    if (profiles.length === 0) {
        return '';
    }
    if (profiles.length === 1) {
        return getUserDisplayName(profiles[0]);
    }
    const list = profiles.slice(0, -1).map((profile) => {
        return getUserDisplayName(profile);
    }).join(', ');
    return list + ' and ' + getUserDisplayName(profiles[profiles.length - 1]);
}

export function playSound(name: string) {
    let src = '';
    switch (name) {
    case 'leave_self':
        src = LeaveSelfSound;
        break;
    case 'join_self':
        src = JoinSelfSound;
        break;
    case 'join_user':
        src = JoinUserSound;
        break;
    default:
        logErr(`sound ${name} not found`);
        return;
    }

    if (src.indexOf('/') === 0) {
        src = getPluginStaticPath() + src;
    }

    const audio = new Audio(src);
    audio.play();
    audio.onended = () => {
        audio.src = '';
        audio.remove();
    };
}

export async function followThread(store: Store, channelID: string, teamID: string) {
    if (!teamID) {
        logDebug('followThread: no team for channel');
        return;
    }
    const threadID = voiceChannelRootPost(store.getState(), channelID);
    if (threadID) {
        store.dispatch(setThreadFollow(getCurrentUserId(store.getState()), teamID, threadID, true));
    } else {
        logErr('Unable to follow call\'s thread, not registered in store');
    }
}

export function shouldRenderDesktopWidget() {
    const win = window.opener ? window.opener : window;
    if (!win.desktop) {
        return false;
    }

    const version = parseSemVer(win.desktop.version);

    if (version.major < 5) {
        return false;
    }

    return version.major > 5 || version.minor >= 3;
}

export function sendDesktopEvent(event: string, data?: Record<string, unknown>) {
    const win = window.opener ? window.opener : window;
    win.postMessage(
        {
            type: event,
            message: data,
        },
        win.location.origin,
    );
}

export function capitalize(input: string) {
    return input.charAt(0).toUpperCase() + input.slice(1);
}
