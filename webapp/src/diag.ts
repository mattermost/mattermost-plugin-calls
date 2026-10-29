// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CheckInfo, CheckStatus, ConnectionCheck} from 'livekit-client';
import RestClient from 'src/clients/rest';

import {logDebug, logErr} from './log';
import {getPluginPath} from './utils';

// Client half of /call diag. Runs livekit-client's ConnectionCheck against a
// throwaway room with a server-minted diag token, then posts the results to the
// server, which merges them with its own checks into a single ephemeral post.

export type DiagStatus = 'ok' | 'warn' | 'fail' | 'skip' | 'info';

export type DiagClientCheck = {
    name: string;
    status: DiagStatus;
    detail?: string;
};

export type DiagClientReport = {
    checks: DiagClientCheck[];
    skipped_reason?: string;
};

type DiagTokenResponse = {
    token: string;
    url: string;
    started_at: number;
};

// A single check should resolve on its own; this only stops a hung one from
// holding up the whole report.
const CHECK_TIMEOUT_MS = 60000;

const NOT_CONFIGURED_STATUS = 503;

function mapStatus(status: CheckStatus): DiagStatus {
    switch (status) {
    case CheckStatus.SUCCESS:
        return 'ok';
    case CheckStatus.FAILED:
        return 'fail';
    default:
        return 'skip';
    }
}

// livekit-client derives RTT from a stat that some servers (e.g. ice-lite) don't
// report, yielding absurd values. Anything over a minute is not a real RTT.
const MAX_PLAUSIBLE_RTT_MS = 60000;

function isImplausibleRTT(message: string): boolean {
    const m = (/^RTT: ([\d.]+) ms$/).exec(message);
    return Boolean(m) && (!isFinite(Number(m![1])) || Number(m![1]) > MAX_PLAUSIBLE_RTT_MS);
}

// livekit-client's messages are lowercase fragments ("best connection quality
// via udp"); tidy them up for display.
function tidy(message: string): string {
    const withProtocols = message.replace(/\b(udp|tcp|tls)\b/gi, (m) => m.toUpperCase());
    return withProtocols.charAt(0).toUpperCase() + withProtocols.slice(1);
}

function summarize(info: CheckInfo): string {
    const logs = info.logs.filter((l) => !isImplausibleRTT(l.message));
    const errors = logs.filter((l) => l.level === 'error').map((l) => tidy(l.message));
    if (errors.length) {
        return errors.join('; ');
    }

    // Warnings first: they are what the reader needs to act on.
    const warnings = logs.filter((l) => l.level === 'warning').map((l) => tidy(l.message));
    const rest = logs.filter((l) => l.level !== 'warning').map((l) => tidy(l.message));
    const ordered = [...warnings, ...rest];
    return ordered.length ? ordered.slice(0, 4).join('; ') : info.description;
}

export function toClientCheck(name: string, info: CheckInfo, opts?: {informational?: boolean}): DiagClientCheck {
    let status = mapStatus(info.status);
    let detail = summarize(info);

    if (info.status === CheckStatus.SUCCESS && info.logs.some((l) => l.level === 'warning')) {
        status = 'warn';
    }

    // TURN is unused in most deployments, so not having it is not a problem.
    if (opts?.informational && status !== 'ok') {
        status = 'info';
        detail = `${detail} TURN is not required for most deployments.`.trim();
    }

    return {name, status, detail};
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

type CheckDef = {
    name: string;
    run: (cc: ConnectionCheck) => Promise<CheckInfo>;
    informational?: boolean;
};

// Ordered cheapest first: the token is short lived.
const defaultChecks: CheckDef[] = [
    {name: 'Signaling (WebSocket)', run: (cc) => cc.checkWebsocket()},
    {name: 'WebRTC', run: (cc) => cc.checkWebRTC()},
    {name: 'TURN', run: (cc) => cc.checkTURN(), informational: true},
    {name: 'Reconnect', run: (cc) => cc.checkReconnect()},
    {name: 'UDP/TCP connection', run: (cc) => cc.checkConnectionProtocol()},
];

// These prompt for microphone and camera permissions, so they are opt-in.
const mediaChecks: CheckDef[] = [
    {name: 'Publish audio', run: (cc) => cc.checkPublishAudio()},
    {name: 'Publish video', run: (cc) => cc.checkPublishVideo()},
];

export async function runClientChecks(url: string, token: string, media: boolean, makeCheck = (u: string, t: string) => new ConnectionCheck(u, t)): Promise<DiagClientCheck[]> {
    const cc = makeCheck(url, token);
    const results: DiagClientCheck[] = [];

    for (const def of media ? [...defaultChecks, ...mediaChecks] : defaultChecks) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const info = await withTimeout(def.run(cc), CHECK_TIMEOUT_MS, def.name);
            results.push(toClientCheck(def.name, info, {informational: def.informational}));
        } catch (err) {
            logErr('diag: check threw', def.name, err);
            results.push({name: def.name, status: def.informational ? 'info' : 'fail', detail: (err as Error)?.message || 'Check failed.'});
        }
    }

    return results;
}

function errorMessage(err: unknown): string {
    return (err as {message?: string})?.message || 'unknown error';
}

// sendClientReport runs the client checks and posts the results. It runs in the
// background, since the checks take tens of seconds and the slash command hook
// only clears the textbox once it resolves.
async function sendClientReport(base: string, channelID: string, rootID: string, tokenRes: DiagTokenResponse | null, media: boolean) {
    const report: DiagClientReport = {checks: []};
    if (tokenRes) {
        try {
            report.checks = await runClientChecks(tokenRes.url, tokenRes.token, media);
        } catch (err) {
            logErr('diag: client checks failed', err);
            report.skipped_reason = `the checks could not run (${errorMessage(err)}).`;
        }
    } else {
        report.skipped_reason = 'LiveKit is not configured.';
    }

    await RestClient.fetch(`${base}/report`, {
        method: 'POST',
        body: JSON.stringify({
            channel_id: channelID,
            root_id: rootID,
            started_at: tokenRes?.started_at ?? 0,
            client: report,
        }),
    });
    logDebug('diag: report sent');
}

// handleDiagCommand starts the client half of `/call diag [force] [media]`. Only
// the token request is awaited, so a refusal (permissions, rate limit) is shown
// inline; the checks and the report continue in the background and the server
// sends the report. onFailure is called if that background work fails. The
// command is not posted as a message.
export async function handleDiagCommand(channelID: string, rootID: string, flags: string[], onFailure: (err: unknown) => void): Promise<{error?: {message: string}}> {
    const base = `${getPluginPath()}/diag`;

    let tokenRes: DiagTokenResponse | null = null;
    try {
        tokenRes = await RestClient.fetch<DiagTokenResponse>(`${base}/token`, {
            method: 'POST',
            body: JSON.stringify({channel_id: channelID, root_id: rootID, force: flags.includes('force')}),
        });
    } catch (err) {
        // With LiveKit unconfigured there is nothing to test from here, but the
        // server half still reports why, so carry on without a token.
        if ((err as {status_code?: number})?.status_code !== NOT_CONFIGURED_STATUS) {
            return {error: {message: `Unable to run diagnostics: ${errorMessage(err)}`}};
        }
    }

    sendClientReport(base, channelID, rootID, tokenRes, flags.includes('media')).catch((err) => {
        logErr('diag: failed to send report', err);
        onFailure(err);
    });

    return {};
}
