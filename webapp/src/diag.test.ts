// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CheckInfo, CheckStatus} from 'livekit-client';
import RestClient from 'src/clients/rest';

import {handleDiagCommand, runClientChecks, toClientCheck} from './diag';

jest.mock('livekit-client', () => ({
    CheckStatus: {IDLE: 0, RUNNING: 1, SKIPPED: 2, SUCCESS: 3, FAILED: 4},
    ConnectionCheck: class {},
}));
jest.mock('src/clients/rest', () => ({__esModule: true, default: {fetch: jest.fn()}}));
jest.mock('./utils', () => ({getPluginPath: () => '/plugins/com.mattermost.calls'}));
jest.mock('./log', () => ({logDebug: jest.fn(), logErr: jest.fn()}));

const mockFetch = RestClient.fetch as unknown as jest.Mock;

const info = (status: CheckStatus, logs: CheckInfo['logs'] = [], description = 'desc'): CheckInfo => ({
    name: 'n',
    description,
    status,
    logs,
});

describe('toClientCheck', () => {
    it('maps statuses', () => {
        expect(toClientCheck('a', info(CheckStatus.SUCCESS)).status).toBe('ok');
        expect(toClientCheck('a', info(CheckStatus.FAILED)).status).toBe('fail');
        expect(toClientCheck('a', info(CheckStatus.SKIPPED)).status).toBe('skip');
    });

    it('prefers error messages for the detail', () => {
        const res = toClientCheck('a', info(CheckStatus.FAILED, [
            {level: 'info', message: 'connecting'},
            {level: 'error', message: 'could not connect'},
        ]));
        expect(res.detail).toBe('Could not connect');
    });

    it('puts warnings before informational messages', () => {
        const res = toClientCheck('a', info(CheckStatus.SUCCESS, [
            {level: 'info', message: 'connected'},
            {level: 'warning', message: 'server is insecure'},
        ]));
        expect(res.detail).toBe('Server is insecure; Connected');
    });

    it('capitalizes messages and protocol names', () => {
        const res = toClientCheck('a', info(CheckStatus.SUCCESS, [
            {level: 'info', message: 'best connection quality via udp'},
            {level: 'info', message: 'upstream bitrate: 1.96 mbps'},
            {level: 'info', message: 'tcp 172.16.0.3:7881 host (private)'},
        ]));
        expect(res.detail).toBe('Best connection quality via UDP; Upstream bitrate: 1.96 mbps; TCP 172.16.0.3:7881 host (private)');
    });

    it('drops an implausible RTT but keeps a real one', () => {
        const res = toClientCheck('a', info(CheckStatus.SUCCESS, [
            {level: 'info', message: 'RTT: 18912824.56 ms'},
            {level: 'info', message: 'jitter: 1.81 ms'},
        ]));
        expect(res.detail).toBe('Jitter: 1.81 ms');

        expect(toClientCheck('a', info(CheckStatus.SUCCESS, [{level: 'info', message: 'RTT: 18.91 ms'}])).detail).toBe('RTT: 18.91 ms');
    });

    it('downgrades a success with warnings', () => {
        const res = toClientCheck('a', info(CheckStatus.SUCCESS, [{level: 'warning', message: 'packets lost: 3%'}]));
        expect(res.status).toBe('warn');
        expect(res.detail).toContain('Packets lost');
    });

    it('reports a missing TURN server as informational, not a failure', () => {
        const res = toClientCheck('TURN', info(CheckStatus.FAILED, [{level: 'error', message: 'no TURN'}]), {informational: true});
        expect(res.status).toBe('info');
        expect(res.detail).toContain('not required');
    });
});

describe('runClientChecks', () => {
    const makeFake = () => {
        const ok = jest.fn(async () => info(CheckStatus.SUCCESS));
        return {
            fake: {
                checkWebsocket: ok,
                checkWebRTC: ok,
                checkTURN: jest.fn(async () => info(CheckStatus.FAILED)),
                checkReconnect: ok,
                checkConnectionProtocol: ok,
                checkPublishAudio: ok,
                checkPublishVideo: ok,
            },
            ok,
        };
    };

    it('runs the default checks without prompting for media permissions', async () => {
        const {fake, ok} = makeFake();
        const res = await runClientChecks('ws://lk', 'tok', false, () => fake as never);

        expect(res.map((c) => c.name)).toEqual(['Signaling (WebSocket)', 'WebRTC', 'TURN', 'Reconnect', 'UDP/TCP connection']);
        expect(res.find((c) => c.name === 'TURN')?.status).toBe('info');
        expect(ok).toHaveBeenCalledTimes(4);
    });

    it('adds publish checks only when media is requested', async () => {
        const {fake} = makeFake();
        const res = await runClientChecks('ws://lk', 'tok', true, () => fake as never);

        expect(res.map((c) => c.name)).toEqual(expect.arrayContaining(['Publish audio', 'Publish video']));
    });

    it('turns a thrown check into a failure and keeps going', async () => {
        const {fake} = makeFake();
        fake.checkWebRTC = jest.fn(async () => {
            throw new Error('boom');
        });
        const res = await runClientChecks('ws://lk', 'tok', false, () => fake as never);

        expect(res).toHaveLength(5);
        expect(res.find((c) => c.name === 'WebRTC')).toEqual({name: 'WebRTC', status: 'fail', detail: 'boom'});
    });
});

describe('handleDiagCommand', () => {
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    beforeEach(() => {
        mockFetch.mockReset();
    });

    it('reports an error and does not send a report when the token is refused', async () => {
        mockFetch.mockRejectedValueOnce({status_code: 403, message: 'forbidden'});
        const onFailure = jest.fn();

        const res = await handleDiagCommand('chan', '', [], onFailure);

        expect(res.error?.message).toContain('forbidden');
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(onFailure).not.toHaveBeenCalled();
    });

    it('resolves without waiting for the report, so the textbox clears', async () => {
        mockFetch.mockRejectedValueOnce({status_code: 503, message: 'LiveKit is not configured'});
        let finishReport: (v: unknown) => void = () => {};
        mockFetch.mockReturnValueOnce(new Promise((resolve) => {
            finishReport = resolve;
        }));

        const res = await handleDiagCommand('chan', 'root', [], jest.fn());

        expect(res).toEqual({});
        finishReport({});
        await flush();
    });

    it('skips the client half but still sends the report when LiveKit is not configured', async () => {
        mockFetch.mockRejectedValueOnce({status_code: 503, message: 'LiveKit is not configured'});
        mockFetch.mockResolvedValueOnce({});

        const res = await handleDiagCommand('chan', 'root', [], jest.fn());
        await flush();

        expect(res).toEqual({});
        const [url, opts] = mockFetch.mock.calls[1];
        expect(url).toBe('/plugins/com.mattermost.calls/diag/report');
        expect(JSON.parse(opts.body)).toEqual({
            channel_id: 'chan',
            root_id: 'root',
            started_at: 0,
            client: {checks: [], skipped_reason: 'LiveKit is not configured.'},
        });
    });

    it('calls onFailure when the report cannot be sent', async () => {
        mockFetch.mockRejectedValueOnce({status_code: 503, message: 'LiveKit is not configured'});
        mockFetch.mockRejectedValueOnce({message: 'network down'});
        const onFailure = jest.fn();

        await handleDiagCommand('chan', '', [], onFailure);
        await flush();

        expect(onFailure).toHaveBeenCalledTimes(1);
    });

    it('passes force to the token request', async () => {
        mockFetch.mockRejectedValueOnce({status_code: 403, message: 'no'});

        await handleDiagCommand('chan', '', ['force'], jest.fn());

        expect(JSON.parse(mockFetch.mock.calls[0][1].body).force).toBe(true);
    });
});
