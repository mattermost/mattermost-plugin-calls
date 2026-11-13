// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {MAX_ACCUMULATED_LOG_SIZE, STORAGE_CALLS_CLIENT_LOGS_KEY} from 'src/constants';
import type {CallsClientStats} from 'src/types/types';

import {flushAndGetLogs, flushLogsToAccumulated, getClientLogs, logDebug, logErr, logInfo, logWarn} from './log';

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

        test('should keep UTF-8 byte size within the limit for multi-byte logs', () => {
            // Emoji are 4 UTF-8 bytes but 2 UTF-16 code units each, so a buffer
            // under the char limit can still exceed the byte limit.
            const multibyte = '🎉'.repeat(MAX_ACCUMULATED_LOG_SIZE);
            mockStorage.set(STORAGE_CALLS_CLIENT_LOGS_KEY, multibyte);

            logDebug('new message');
            flushLogsToAccumulated();

            const accumulated = getClientLogs();
            const byteSize = new TextEncoder().encode(accumulated).length;
            expect(byteSize).toBeLessThanOrEqual(MAX_ACCUMULATED_LOG_SIZE);
            expect(accumulated).toContain('[... older logs truncated ...]');
        });

        test('should not throw when storage fails, and still clear the in-memory buffer', () => {
            const setSpy = jest.spyOn(mockStorage, 'set').mockImplementationOnce(() => {
                throw new Error('QuotaExceededError');
            });

            logDebug('message that cannot be persisted');
            expect(() => flushLogsToAccumulated()).not.toThrow();

            setSpy.mockRestore();

            // The in-memory buffer must be cleared even when the write failed,
            // so a subsequent successful flush does not re-include it.
            flushLogsToAccumulated();
            expect(getClientLogs()).not.toContain('message that cannot be persisted');
        });

        test('should handle truncation with stats', () => {
            // Fill storage near the limit
            const largeLogs = 'log line\n'.repeat(MAX_ACCUMULATED_LOG_SIZE / 10);
            mockStorage.set(STORAGE_CALLS_CLIENT_LOGS_KEY, largeLogs);

            const stats: CallsClientStats = {
                initTime: 123456,
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
            expect(accumulated).toContain('{"foo":"bar","nested":{"value":123}}');
        });

        test('should cap large object args at 256 chars with an ellipsis', () => {
            const big = {blob: 'z'.repeat(1000)};
            logDebug('big:', big);
            flushLogsToAccumulated();

            const accumulated = getClientLogs();

            // The serialized object portion is truncated to 256 chars ending in '...'.
            const serialized = JSON.stringify(big);
            expect(accumulated).not.toContain(serialized);
            expect(accumulated).toContain(serialized.slice(0, 253) + '...');
        });

        test('should not cap string or Error args', () => {
            const longMessage = 'm'.repeat(1000);
            const err = new Error('boom');
            logErr(longMessage, err);
            flushLogsToAccumulated();

            const accumulated = getClientLogs();

            // Strings pass through uncapped...
            expect(accumulated).toContain(longMessage);

            // ...and Errors serialize to their stack (or name: message), uncapped.
            expect(accumulated).toContain(err.stack || 'Error: boom');
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

    describe('flushAndGetLogs', () => {
        test('flushes in-memory logs and returns the accumulated buffer', () => {
            logInfo('flush and get');

            const result = flushAndGetLogs();

            expect(result).toContain('flush and get');
            expect(result).toBe(getClientLogs());
        });

        test('returns an empty string when there is nothing to flush', () => {
            expect(flushAndGetLogs()).toBe('');
        });

        test('is exposed on window for popout delegation', () => {
            expect(window.callsClientFlushAndGetLogs).toBe(flushAndGetLogs);
        });
    });

    describe('in-memory auto-flush', () => {
        test('flushes to storage once the in-memory buffer exceeds 50 KB', () => {
            logInfo('x'.repeat(51 * 1024));

            // No explicit flush: the write itself should have persisted.
            expect(getClientLogs()).toContain('x'.repeat(1024));
        });

        test('does not flush for small writes', () => {
            logInfo('small write');

            expect(getClientLogs()).toBe('');
        });
    });

    describe('window error listeners', () => {
        // JSDOM does not implement PromiseRejectionEvent, so synthesise one.
        const dispatchRejection = (reason: unknown) => {
            const event = new Event('unhandledrejection');
            Object.defineProperty(event, 'reason', {value: reason});
            window.dispatchEvent(event);
        };

        test('captures uncaught errors', () => {
            const error = new Error('kaboom');
            window.dispatchEvent(new ErrorEvent('error', {message: 'kaboom', filename: 'a.js', lineno: 1, colno: 2, error}));

            const logs = flushAndGetLogs();
            expect(logs).toContain('[uncaught]');
            expect(logs).toContain('kaboom');
        });

        test('captures Error rejections', () => {
            dispatchRejection(new Error('rejected error'));

            const logs = flushAndGetLogs();
            expect(logs).toContain('[unhandledrejection]');
            expect(logs).toContain('rejected error');
        });

        test('serialises non-Error object rejections instead of [object Object]', () => {
            dispatchRejection({code: 42, detail: 'bad'});

            const logs = flushAndGetLogs();
            expect(logs).toContain('[unhandledrejection] {"code":42,"detail":"bad"}');
            expect(logs).not.toContain('[object Object]');
        });
    });

    describe('popout write-through', () => {
        const originalOpener = Object.getOwnPropertyDescriptor(window, 'opener');

        const setOpener = (opener: unknown) => {
            Object.defineProperty(window, 'opener', {value: opener, configurable: true, writable: true});
        };

        afterEach(() => {
            if (originalOpener) {
                Object.defineProperty(window, 'opener', originalOpener);
            } else {
                setOpener(null);
            }
        });

        test('routes logs to opener buffer when running as a popout', () => {
            const append = jest.fn();
            setOpener({callsClientLogAppend: append});

            logInfo('popout gesture');
            flushLogsToAccumulated();

            // The formatted line went to the opener, not this realm's buffer.
            expect(append).toHaveBeenCalledTimes(1);
            expect(append.mock.calls[0][0]).toContain('popout gesture');
            expect(append.mock.calls[0][0]).toContain('info');
            expect(getClientLogs()).not.toContain('popout gesture');
        });

        test('falls back to local buffer when opener is same-origin without appender', () => {
            setOpener({});

            logInfo('no appender');
            flushLogsToAccumulated();

            expect(getClientLogs()).toContain('no appender');
        });

        test('falls back to local buffer when opener access throws (cross-origin)', () => {
            setOpener(new Proxy({}, {
                get() {
                    throw new Error('Blocked a frame with origin');
                },
            }));

            logInfo('cross origin opener');
            flushLogsToAccumulated();

            expect(getClientLogs()).toContain('cross origin opener');
        });

        test('does not route to itself when there is no opener', () => {
            setOpener(null);

            logInfo('main window');
            flushLogsToAccumulated();

            expect(getClientLogs()).toContain('main window');
        });
    });
});
