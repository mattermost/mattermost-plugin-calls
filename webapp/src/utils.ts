import {UserState} from '@calls/common/lib/types';
import {Channel} from '@mattermost/types/channels';
import {ClientConfig} from '@mattermost/types/config';

import {GlobalState} from '@mattermost/types/store';

import {Team} from '@mattermost/types/teams';
import {UserProfile} from '@mattermost/types/users';
import {setThreadFollow} from 'mattermost-redux/actions/threads';
import {Client4} from 'mattermost-redux/client';
import {getRedirectChannelNameForTeam} from 'mattermost-redux/selectors/entities/channels';

import {getCurrentRelativeTeamUrl, getCurrentTeamId, getTeam} from 'mattermost-redux/selectors/entities/teams';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {parseSemVer} from 'semver-parser';

import {logDebug, logErr, logWarn} from './log';

import {ColorRGB, ColorHSL} from './types/types';

import {pluginId} from './manifest';

import {voiceChannelRootPost} from './selectors';
import JoinSelfSound from './sounds/join_self.mp3';
import JoinUserSound from './sounds/join_user.mp3';

import LeaveSelfSound from './sounds/leave_self.mp3';

import {Store} from './types/mattermost-webapp';

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

export function getUserDisplayName(user: UserProfile | undefined, shortForm?: boolean) {
    if (!user) {
        return '';
    }

    if (user.first_name && user.last_name) {
        return shortForm ?
            `${user.first_name} ${user.last_name[0]}.` :
            `${user.first_name} ${user.last_name}`;
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

        if (stateA.raised_hand && !stateB.raised_hand) {
            return -1;
        } else if (stateB.raised_hand && !stateA.raised_hand) {
            return 1;
        } else if (stateA.raised_hand && stateB.raised_hand) {
            return stateA.raised_hand - stateB.raised_hand;
        }

        if (stateA.unmuted && !stateB.unmuted) {
            return -1;
        } else if (stateB.unmuted && !stateA.unmuted) {
            return 1;
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

export async function fetchTranslationsFile(locale: string) {
    if (locale === 'en') {
        return {};
    }
    try {
        // eslint-disable-next-line global-require
        const filename = require(`../i18n/${locale}.json`).default;
        if (!filename) {
            throw new Error(`translations file not found for locale '${locale}'`);
        }
        const res = await fetch(filename.indexOf('/') === 0 ? getPluginStaticPath() + filename : filename);
        const translations = await res.json();
        logDebug(`loaded i18n file for locale '${locale}'`);
        return translations;
    } catch (err) {
        logWarn(`failed to load i18n file for locale '${locale}':`, err);
        return {};
    }
}

export function untranslatable(msg: string) {
    return msg;
}

export function getTranslations(locale: string) {
    try {
        logDebug(`loading translations file for locale '${locale}'`);

        // synchronously loading all translation files from bundle (MM-50811).
        // eslint-disable-next-line global-require
        return require(`../i18n/${locale}.json`);
    } catch (err) {
        logWarn(`failed to open translations file for locale '${locale}'`, err);
        return {};
    }
}

export function hexToRGB(h: string) {
    if (h.length !== 7 || h[0] !== '#') {
        throw new Error(`invalid hex color string '${h}'`);
    }

    return {
        r: parseInt(h[1] + h[2], 16),
        g: parseInt(h[3] + h[4], 16),
        b: parseInt(h[5] + h[6], 16),
    };
}

export function rgbToHSL(c: ColorRGB) {
    // normalize components into [0,1]
    const R = c.r / 255;
    const G = c.g / 255;
    const B = c.b / 255;

    // value
    const V = Math.max(R, G, B);

    // chroma
    const C = V - Math.min(R, G, B);

    // lightness
    const L = V - (C / 2);

    // saturation
    let S = 0;
    if (L > 0 && L < 1) {
        S = C / (1 - Math.abs((2 * V) - C - 1));
    }

    // hue
    let h = 0;
    if (C !== 0) {
        switch (V) {
        case R:
            h = 60 * (((G - B) / C) % 6);
            break;
        case G:
            h = 60 * (((B - R) / C) + 2);
            break;
        case B:
            h = 60 * (((R - G) / C) + 4);
            break;
        }
    }

    return {
        h: Math.round(h >= 0 ? h : h + 360),
        s: Math.round(S * 100),
        l: Math.round(L * 100),
    };
}

export function hslToRGB(c: ColorHSL) {
    const H = c.h;
    const S = c.s / 100;
    const L = c.l / 100;

    const f = (n: number) => {
        const k = (n + (H / 30)) % 12;
        const a = S * Math.min(L, 1 - L);
        return L - (a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    };

    return {
        r: Math.round(f(0) * 255),
        g: Math.round(f(8) * 255),
        b: Math.round(f(4) * 255),
    };
}

export function rgbToCSS(c: ColorRGB) {
    return `rgb(${c.r},${c.g},${c.b})`;
}

export function setCallsGlobalCSSVars(baseColor: string) {
    // Base color is Sidebar Hover Background.
    const baseColorHSL = rgbToHSL(hexToRGB(baseColor));

    // Setting lightness to 16 to improve contrast.
    baseColorHSL.l = 16;
    const baseColorRGB = hslToRGB(baseColorHSL);

    // badgeBG is baseColor with a 0.16 opacity white overlay on top.
    const badgeBgRGB = {
        r: Math.round(baseColorRGB.r + (255 * 0.16)),
        g: Math.round(baseColorRGB.g + (255 * 0.16)),
        b: Math.round(baseColorRGB.b + (255 * 0.16)),
    };

    // Setting CSS variables for calls background.
    const rootEl = document.querySelector(':root') as HTMLElement;
    rootEl?.style.setProperty('--calls-bg', rgbToCSS(baseColorRGB));
    rootEl?.style.setProperty('--calls-bg-rgb', `${baseColorRGB.r},${baseColorRGB.g},${baseColorRGB.b}`);
    rootEl?.style.setProperty('--calls-badge-bg', rgbToCSS(badgeBgRGB));
}
