// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {MAX_ACCUMULATED_LOG_SIZE, STORAGE_CALLS_CLIENT_LOGS_KEY} from 'src/constants';
import type {CallsClientStats} from 'src/types/types';

import {flushLogsToAccumulated, getClientLogs, logDebug, logErr, logInfo, logWarn} from './log';

// Mock the manifest
jest.mock('./manifest', () => ({
    pluginId: 'com.mattermost.calls',
}));

// Mock getPersistentStorage
const mockStorage = new Map<string, string>();
jest.mock('./utils', () => ({
    getPersistentStorage: () => ({
        getItem: (key: string) => mockStorage.get(key) || null,
        setItem: (key: string, value: string) => mockStorage.set(key, value),
        removeItem: (key: string) => mockStorage.delete(key),
    }),
}));

describe('log', () => {
    /* eslint-disable no-console */
    const originalConsole = {
        error: console.error,
        warn: console.warn,
        info: console.info,
        debug: console.debug,
    };

    beforeAll(() => {
        console.error = jest.fn();
        console.warn = jest.fn();
        console.info = jest.fn();
        console.debug = jest.fn();
    });

    afterAll(() => {
        console.error = originalConsole.error;
        console.warn = originalConsole.warn;
        console.info = originalConsole.info;
        console.debug = originalConsole.debug;
    });
    /* eslint-enable no-console */

    beforeEach(() => {
        flushLogsToAccumulated();
        mockStorage.clear();
        jest.clearAllMocks();
    });

    describe('flushLogsToAccumulated', () => {
        test('should append in-memory logs to accumulated buffer', () => {
            logDebug('test message 1');
            logInfo('test message 2');

            flushLogsToAccumulated();

            const accumulated = getClientLogs();
            expect(accumulated).toContain('test message 1');
            expect(accumulated).toContain('test message 2');
            expect(accumulated).toContain('debug');
            expect(accumulated).toContain('info');
        });

        test('should include timestamp in log entries', () => {
            const beforeTime = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
            logDebug('test message');
            flushLogsToAccumulated();

            const accumulated = getClientLogs();
            expect(accumulated).toContain(beforeTime);
        });

        test('should append stats when provided', () => {
            const stats: CallsClientStats = {
                initTime: 123456,
                callID: 'test-call',
                channelID: 'test-channel',
                tracksInfo: [],
                rtcStats: {
                    ssrcStats: {},
                    iceStats: {
                        'in-progress': [],
                        succeeded: [],
                        waiting: [],
                    },
                },
            };

            flushLogsToAccumulated(stats);

            const accumulated = getClientLogs();
            expect(accumulated).toContain('--- Call Stats ---');
            expect(accumulated).toContain(JSON.stringify(stats));
            expect(accumulated).toContain('---');
        });

        test('should handle empty logs gracefully', () => {
            // Don't log anything, just flush
            flushLogsToAccumulated();

            const accumulated = getClientLogs();
            expect(accumulated).toBe('');
        });

        test('should clear in-memory logs after flush', () => {
            logDebug('test message');
            flushLogsToAccumulated();

            const firstAccumulated = getClientLogs();
            expect(firstAccumulated).toContain('test message');

            // Flush again without logging - should not duplicate
            flushLogsToAccumulated();

            const secondAccumulated = getClientLogs();
            expect(secondAccumulated).toBe(firstAccumulated);
        });

        test('should accumulate logs across multiple flushes', () => {
            logDebug('message 1');
            flushLogsToAccumulated();

            logDebug('message 2');
            flushLogsToAccumulated();

            const accumulated = getClientLogs();
            expect(accumulated).toContain('message 1');
            expect(accumulated).toContain('message 2');
        });

        test('should truncate when exceeding MAX_ACCUMULATED_LOG_SIZE', () => {
            // Create a large log that definitely exceeds the 1MB limit
            // Use a clearly identifiable pattern at start and end
            const oldLogsStart = 'START_MARKER_SHOULD_BE_REMOVED\n';
            const oldLogsMiddle = 'x'.repeat(MAX_ACCUMULATED_LOG_SIZE);
            const oldLogsEnd = '\nEND_MARKER_SHOULD_BE_KEPT\n';
            const largeMessage = oldLogsStart + oldLogsMiddle + oldLogsEnd;

            mockStorage.set(STORAGE_CALLS_CLIENT_LOGS_KEY, largeMessage);

            logDebug('newest message');
            flushLogsToAccumulated();

            const accumulated = getClientLogs();

            // Should be at or under the limit
            expect(accumulated.length).toBeLessThanOrEqual(MAX_ACCUMULATED_LOG_SIZE);

            // Should contain truncation marker
            expect(accumulated).toContain('[... older logs truncated ...]');

            // Should contain new message (most recent)
            expect(accumulated).toContain('newest message');

            // Should NOT contain the start marker (old logs were truncated from the beginning)
            expect(accumulated).not.toContain('START_MARKER_SHOULD_BE_REMOVED');

            // Should contain the end marker (keeps most recent logs)
            expect(accumulated).toContain('END_MARKER_SHOULD_BE_KEPT');
        });

        test('should keep most recent logs when truncating', () => {
            // Fill storage with old logs
            const oldLogs = 'old log line\n'.repeat(100000); // Very large
            mockStorage.set(STORAGE_CALLS_CLIENT_LOGS_KEY, oldLogs);

            logDebug('newest message');
            flushLogsToAccumulated();

            const accumulated = getClientLogs();

            // Should contain the newest message
            expect(accumulated).toContain('newest message');

            // Should be properly sized
            expect(accumulated.length).toBeLessThanOrEqual(MAX_ACCUMULATED_LOG_SIZE);
        });

        test('should handle truncation edge case: exactly at limit', () => {
            const exactSizeLog = 'y'.repeat(MAX_ACCUMULATED_LOG_SIZE - 100);
            mockStorage.set(STORAGE_CALLS_CLIENT_LOGS_KEY, exactSizeLog);

            logDebug('new message');
            flushLogsToAccumulated();

            const accumulated = getClientLogs();
            expect(accumulated.length).toBeLessThanOrEqual(MAX_ACCUMULATED_LOG_SIZE);
        });

        test('should handle truncation with stats', () => {
            // Fill storage near the limit
            const largeLogs = 'log line\n'.repeat(MAX_ACCUMULATED_LOG_SIZE / 10);
            mockStorage.set(STORAGE_CALLS_CLIENT_LOGS_KEY, largeLogs);

            const stats: CallsClientStats = {
                initTime: 123456,
                callID: 'test-call',
                channelID: 'test-channel',
                tracksInfo: [],
                rtcStats: {
                    ssrcStats: {},
                    iceStats: {
                        'in-progress': [],
                        succeeded: [],
                        waiting: [],
                    },
                },
            };

            flushLogsToAccumulated(stats);

            const accumulated = getClientLogs();

            // Stats should be present
            expect(accumulated).toContain('--- Call Stats ---');

            // Should not exceed limit
            expect(accumulated.length).toBeLessThanOrEqual(MAX_ACCUMULATED_LOG_SIZE);
        });
    });

    describe('logging functions', () => {
        test('logErr should append error logs', () => {
            logErr('error message', 'additional', 'args');
            flushLogsToAccumulated();

            const accumulated = getClientLogs();
            expect(accumulated).toContain('error');
            expect(accumulated).toContain('error message');
            expect(accumulated).toContain('additional');
            expect(accumulated).toContain('args');
        });

        test('logWarn should append warning logs', () => {
            logWarn('warning message');
            flushLogsToAccumulated();

            const accumulated = getClientLogs();
            expect(accumulated).toContain('warn');
            expect(accumulated).toContain('warning message');
        });

        test('logInfo should append info logs', () => {
            logInfo('info message');
            flushLogsToAccumulated();

            const accumulated = getClientLogs();
            expect(accumulated).toContain('info');
            expect(accumulated).toContain('info message');
        });

        test('logDebug should append debug logs', () => {
            logDebug('debug message');
            flushLogsToAccumulated();

            const accumulated = getClientLogs();
            expect(accumulated).toContain('debug');
            expect(accumulated).toContain('debug message');
        });

        test('should handle multiple log levels in order', () => {
            logErr('first');
            logWarn('second');
            logInfo('third');
            logDebug('fourth');
            flushLogsToAccumulated();

            const accumulated = getClientLogs();
            const firstPos = accumulated.indexOf('first');
            const secondPos = accumulated.indexOf('second');
            const thirdPos = accumulated.indexOf('third');
            const fourthPos = accumulated.indexOf('fourth');

            expect(firstPos).toBeLessThan(secondPos);
            expect(secondPos).toBeLessThan(thirdPos);
            expect(thirdPos).toBeLessThan(fourthPos);
        });

        test('should handle objects in log messages', () => {
            const obj = {foo: 'bar', nested: {value: 123}};
            logDebug('object:', obj);
            flushLogsToAccumulated();

            const accumulated = getClientLogs();
            expect(accumulated).toContain('object:');
            expect(accumulated).toContain('[object Object]');
        });
    });

    describe('getClientLogs', () => {
        test('should return empty string when no logs', () => {
            const logs = getClientLogs();
            expect(logs).toBe('');
        });

        test('should return accumulated logs', () => {
            mockStorage.set(STORAGE_CALLS_CLIENT_LOGS_KEY, 'test logs');
            const logs = getClientLogs();
            expect(logs).toBe('test logs');
        });
    });
});
