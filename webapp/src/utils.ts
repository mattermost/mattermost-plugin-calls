import {makeCallsBaseAndBadgeRGB, rgbToCSS} from '@mattermost/calls-common';
import {CallPostProps, CallRecordingPostProps, SessionState, UserSessionState} from '@mattermost/calls-common/lib/types';
import {Channel} from '@mattermost/types/channels';
import {ClientConfig} from '@mattermost/types/config';
import {Post} from '@mattermost/types/posts';
import {GlobalState} from '@mattermost/types/store';
import {Team} from '@mattermost/types/teams';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';
import {DateTime, Duration, DurationLikeObject} from 'luxon';
import {setThreadFollow} from 'mattermost-redux/actions/threads';
import {General} from 'mattermost-redux/constants';
import {getRedirectChannelNameForTeam} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentRelativeTeamUrl, getCurrentTeamId, getTeam} from 'mattermost-redux/selectors/entities/teams';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {IntlShape} from 'react-intl';
import {parseSemVer} from 'semver-parser';
import CallsClient from 'src/client';
import RestClient from 'src/rest_client';
import {notificationSounds} from 'src/webapp_globals';

import {logDebug, logErr, logWarn} from './log';
import {pluginId} from './manifest';
import {threadIDForCallInChannel} from './selectors';
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

    return `${baseURL}${RestClient.getUrlVersion()}/websocket`;
}

export function getTeamRelativeURL(team?: Team) {
    if (!team) {
        return '';
    }

    return `/${team.name}`;
}

export function getPopOutURL(team: Team, channel: Channel) {
    return `${window.basename || ''}/${team.name}/${pluginId}/expanded/${channel.id}`;
}

export function getChannelURL(state: GlobalState, channel?: Channel, teamId?: string) {
    let channelURL;
    if (channel && (channel.type === 'D' || channel.type === 'G')) {
        channelURL = getCurrentRelativeTeamUrl(state) + '/channels/' + channel.name;
    } else if (channel && teamId) {
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
    if (channelURL.startsWith('//')) {
        channelURL = channelURL.slice(1);
    }
    return channelURL;
}

export function getCallsClient(): CallsClient | undefined {
    let callsClient;
    try {
        callsClient = window.opener ? window.opener.callsClient : window.callsClient;
    } catch (err) {
        logErr(err);
    }
    return callsClient;
}

export function getCallsClientChannelID(): string {
    return getCallsClient()?.channelID || '';
}

export function getCallsClientSessionID(): string {
    return getCallsClient()?.getSessionID() || '';
}

export function getCallsClientInitTime(): number {
    return getCallsClient()?.initTime || 0;
}

export function isCallsPopOut(): boolean {
    try {
        return window.opener && window.opener.callsClient;
    } catch (err) {
        logErr(err);
        return false;
    }
    return false;
}

export function shouldRenderCallsIncoming() {
    try {
        const win = window.opener ? window.opener : window;
        const nonChannels = window.location.pathname.startsWith('/boards') || window.location.pathname.startsWith('/playbooks') || window.location.pathname.includes(`${pluginId}/expanded/`);
        if (win.desktop && nonChannels) {
        // don't render when we're in desktop, or in boards or playbooks, or in the expanded view.
        // (can be simplified, but this is clearer)
            return false;
        }
        return true;
    } catch (err) {
        logErr(err);
        return false;
    }
}

export function getUserDisplayName(user: UserProfile | undefined, shortForm?: boolean) {
    if (!user) {
        return '';
    }

    if (user.first_name && user.last_name) {
        return shortForm ? `${user.first_name} ${user.last_name[0]}.` : `${user.first_name} ${user.last_name}`;
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

export function alphaSortSessions(profiles: IDMappedObjects<UserProfile>) {
    return (elA: UserSessionState, elB: UserSessionState) => {
        const profileA = profiles[elA.user_id];
        const profileB = profiles[elB.user_id];
        const nameA = getUserDisplayName(profileA);
        const nameB = getUserDisplayName(profileB);
        return nameA.localeCompare(nameB);
    };
}

export function stateSortSessions(presenterID: string, considerReaction = false) {
    return (stateA: UserSessionState, stateB: UserSessionState) => {
        if (stateA.session_id === presenterID) {
            return -1;
        } else if (stateB.session_id === presenterID) {
            return 1;
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

export function isDMChannel(channel?: Channel) {
    return channel?.type === General.DM_CHANNEL;
}

export function isGMChannel(channel?: Channel) {
    return channel?.type === General.GM_CHANNEL;
}

export function isDmGmChannel(channel?: Channel) {
    return isDMChannel(channel) || isGMChannel(channel);
}

export function isPublicChannel(channel?: Channel) {
    return channel?.type === 'O';
}

export function isPrivateChannel(channel?: Channel) {
    return channel?.type === 'P';
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
        profiles.push(...(await RestClient.getProfilesByIds(missingIds)));
    }
    return profiles;
}

export function getUserIDsForSessions(sessions: SessionState[]) {
    const idsMap: {[id: string]: boolean} = {};
    for (const session of sessions) {
        idsMap[session.user_id] = true;
    }
    return Object.keys(idsMap);
}

export function getSessionsMapFromSessions(sessions: SessionState[]) {
    return sessions.reduce((map: Record<string, SessionState>, session: SessionState) => {
        map[session.session_id] = session;
        return map;
    }, {});
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

export function split<T>(list: T[], i: number, pad = false): [list: T[], overflowed?: T[]] {
    if (list.length <= i + (pad ? 1 : 0)) {
        return [list];
    }
    return [list.slice(0, i), list.slice(i)];
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

export async function followThread(store: Store, channelID: string, teamID?: string) {
    if (!teamID) {
        logDebug('followThread: no team for channel');
        return;
    }
    const threadID = threadIDForCallInChannel(store.getState(), channelID);
    if (threadID) {
        store.dispatch(setThreadFollow(getCurrentUserId(store.getState()), teamID, threadID, true));
    } else {
        logErr('Unable to follow call\'s thread, not registered in store');
    }
}

export function shouldRenderDesktopWidget() {
    return desktopGTE(5, 3);
}

export function desktopGTE(major: number, minor: number) {
    const win = window.opener ? window.opener : window;
    if (!win.desktop) {
        return false;
    }

    const version = parseSemVer(win.desktop.version);

    if (version.major < major) {
        return false;
    }

    return version.major > major || version.minor >= minor;
}

// DEPRECATED: legacy Desktop API logic (<= 5.6.0)
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

export function sendDesktopError(channelID?: string, errMsg?: string) {
    if (window.desktopAPI?.sendCallsError) {
        logDebug('desktopAPI.sendCallsError');
        window.desktopAPI.sendCallsError('client-error', channelID, errMsg);
    } else {
        // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
        sendDesktopEvent('calls-error', {
            err: 'client-error',
            callID: channelID,
            errMsg,
        });
    }
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

        // Remapping some language codes to their actual file.
        // This is needed as Mattermost product uses different codes for
        // certain languages such as simplified and traditional Chinese.
        switch (locale) {
        case 'zh-CN':
            locale = 'zh_Hans';
            break;
        case 'zh-TW':
            locale = 'zh_Hant';
            break;
        }

        // synchronously loading all translation files from bundle (MM-50811).
        // eslint-disable-next-line global-require
        return require(`../i18n/${locale}.json`);
    } catch (err) {
        logWarn(`failed to open translations file for locale '${locale}'`, err);
        return {};
    }
}

export function setCallsGlobalCSSVars(baseColor: string) {
    const {baseColorRGB, badgeBgRGB} = makeCallsBaseAndBadgeRGB(baseColor);

    // Setting CSS variables for calls background.
    const rootEl = document.querySelector(':root') as HTMLElement;
    rootEl?.style.setProperty('--calls-bg', rgbToCSS(baseColorRGB));
    rootEl?.style.setProperty('--calls-bg-rgb', `${baseColorRGB.r},${baseColorRGB.g},${baseColorRGB.b}`);
    rootEl?.style.setProperty('--calls-badge-bg', rgbToCSS(badgeBgRGB));
}

// momentjs's 'a few seconds' threshold
const aFewSecondsThreshold = 1000 * 44;
const aFewSecondsDur = Duration.fromObject({milliseconds: aFewSecondsThreshold});
const oneMinute = Duration.fromObject({minutes: 1});

// Adapted from https://github.com/moment/luxon/issues/1134
export function toHuman(intl: IntlShape, dur: Duration, smallestUnit = 'seconds', opts = {}): string {
    if (dur < aFewSecondsDur) {
        return intl.formatMessage({defaultMessage: 'a few seconds'});
    } else if (dur < oneMinute) {
        dur = oneMinute;
    }

    const units = ['years', 'months', 'days', 'hours', 'minutes', 'seconds', 'milliseconds'];
    const smallestIdx = units.indexOf(smallestUnit);
    const unitsIdxs = units as (keyof DurationLikeObject)[];
    const entries = Object.entries(
        dur.shiftTo(...unitsIdxs).normalize().toObject(),
    ).filter(([_unit, amount], idx) => amount > 0 && idx <= smallestIdx);
    const dur2 = Duration.fromObject(
        entries.length === 0 ? {[smallestUnit]: 0} : Object.fromEntries(entries),
    );
    return dur2.toHuman(opts);
}

export function callStartedTimestampFn(intl: IntlShape, startAt?: number) {
    let startAtMillis = startAt || Date.now();
    if (Date.now() - startAtMillis < aFewSecondsThreshold) {
        return intl.formatMessage({defaultMessage: 'a few seconds ago'});
    } else if (Date.now() - startAtMillis < 60 * 1000) {
        startAtMillis = Date.now() - (60 * 1000);
    }

    return DateTime.fromMillis(startAtMillis).toRelative() || '';
}

export function userAgent(): string {
    return window.navigator.userAgent;
}

export function isDesktopApp(): boolean {
    return userAgent().indexOf('Mattermost') !== -1 && userAgent().indexOf('Electron') !== -1;
}

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export const maxAttemptsReachedErr = new Error('maximum retry attempts reached');

export async function runWithRetry(fn: () => any, retryIntervalMs = 100, maxAttempts = 10) {
    for (let i = 1; i < maxAttempts + 1; i++) {
        try {
            // eslint-disable-next-line no-await-in-loop
            return await fn();
        } catch (err) {
            const waitMs = Math.floor((retryIntervalMs * i) + (Math.random() * retryIntervalMs));
            logErr(err);
            logDebug(`run failed (${i}), retrying in ${waitMs}ms`);
            // eslint-disable-next-line no-await-in-loop
            await sleep(waitMs);
        }
    }

    throw maxAttemptsReachedErr;
}

export function notificationsStopRinging() {
    notificationSounds?.stopRing();

    // window.e2eNotificationsSoundStoppedAt is added when running the e2e tests
    if (window.e2eNotificationsSoundStoppedAt) {
        window.e2eNotificationsSoundStoppedAt.push(Date.now());
    }
}

export function getCallPropsFromPost(post: Post): CallPostProps {
    return {
        title: post.props?.title,
        start_at: post.props?.start_at,
        end_at: post.props?.end_at,
        recordings: post.props?.recordings || [],
        transcriptions: post.props?.transcriptions || [],
        participants: post.props?.participants || [],

        // DEPRECATED
        recording_files: post.props?.recording_files || [],
    };
}

export function getCallRecordingPropsFromPost(post: Post): CallRecordingPostProps {
    return {
        call_post_id: post.props?.call_post_id,
        recording_id: post.props?.recording_id,
        captions: post.props?.captions || [],
    };
}

export function getWebappUtils() {
    let utils;
    try {
        utils = window.opener ? window.opener.WebappUtils : window.WebappUtils;
    } catch (err) {
        logErr(err);
    }

    return utils;
}
