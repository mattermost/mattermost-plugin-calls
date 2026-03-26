// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Post} from '@mattermost/types/posts';
import {Duration} from 'luxon';
import {createIntl} from 'react-intl';

import CallsClient from './client';
import {pluginId} from './manifest';
import {
    callStartedTimestampFn,
    getCallPropsFromPost,
    getCallRecordingPropsFromPost,
    getCallsClient,
    getCallsWindow,
    getPlatformInfo,
    getWebappUtils,
    getWSConnectionURL,
    maxAttemptsReachedErr,
    runWithRetry,
    shouldRenderCallsIncoming,
    shouldRenderDesktopWidget,
    sleep,
    toHuman,
} from './utils';

describe('utils', () => {
    describe('getWSConnectionURL', () => {
        const testCases = [
            {
                description: 'undefined',
                config: {},
                expected: 'ws://localhost:8065/api/v4/websocket',
            },
            {
                description: 'empty config.WebsocketURL',
                config: {WebsocketURL: ''},
                expected: 'ws://localhost:8065/api/v4/websocket',
            },
            {
                description: 'config.WebsocketURL',
                config: {WebsocketURL: 'wss://ws.localhost:8065'},
                expected: 'wss://ws.localhost:8065/api/v4/websocket',
            },
        ];

        testCases.forEach((testCase) => it(testCase.description, () => {
            expect(getWSConnectionURL(testCase.config)).toEqual(testCase.expected);
        }));
    });

    describe('shouldRenderDesktopWidget', () => {
        const testCases = [
            {
                description: 'equals',
                actual: '5.3.0',
                expected: true,
            },
            {
                description: 'greater',
                actual: '5.3.1',
                expected: true,
            },
            {
                description: 'lesser',
                actual: '5.2.9',
                expected: false,
            },
            {
                description: 'nightly build',
                actual: '5.3.0-nightly.20230124',
                expected: true,
            },
            {
                description: 'patch version',
                actual: '5.3.1',
                expected: true,
            },
            {
                description: 'major version',
                actual: '6.0.0',
                expected: true,
            },
            {
                description: 'complex',
                actual: '5.3.0-alpha.something+meta-data',
                expected: true,
            },
        ];

        testCases.forEach((testCase) => it(testCase.description, () => {
            window.desktop = {
                version: testCase.actual,
            };
            expect(shouldRenderDesktopWidget()).toEqual(testCase.expected);
            delete window.desktop;
        }));
    });

    describe('toHuman from luxon duration', () => {
        const testCases = [
            {
                description: '0 seconds',
                input: Duration.fromMillis(0),
                expected: 'a few seconds',
            },
            {
                description: '0 seconds short',
                input: Duration.fromMillis(0),
                expected: 'a few seconds',
                opts: {unitDisplay: 'short'},
            },
            {
                description: '43 seconds',
                input: Duration.fromObject({seconds: 43}),
                expected: 'a few seconds',
            },
            {
                description: '44 seconds',
                input: Duration.fromObject({seconds: 44}),
                expected: '1 minute',
            },
            {
                description: '4 min, 45 sec',
                input: Duration.fromObject({minutes: 4, seconds: 45}),
                expected: '4 min, 45 sec',
                opts: {unitDisplay: 'short'},
            },
            {
                description: '4 minutes, 45 seconds',
                input: Duration.fromObject({minutes: 4, seconds: 45}),
                expected: '4 minutes, 45 seconds',
            },
            {
                description: '1 hr, 22 min, 59 sec',
                input: Duration.fromObject({hours: 1, minutes: 22, seconds: 59}),
                expected: '1 hr, 22 min, 59 sec',
                opts: {unitDisplay: 'short'},
            },
            {
                description: 'neg number = 0 sec',
                input: Duration.fromMillis(-23),
                expected: 'a few seconds',
            },
            {
                description: '3 hours, 1 minute',
                input: Duration.fromObject({hours: 3, minutes: 1, seconds: 59}),
                expected: '3 hours, 1 minute',
                smallestUnit: 'minutes',
            },
            {
                description: '1 hour, 59 seconds',
                input: Duration.fromObject({hours: 1, seconds: 59}),
                expected: '1 hour, 59 seconds',
            },
            {
                description: '1 hour',
                input: Duration.fromObject({hours: 1, minutes: 59, seconds: 59}),
                expected: '1 hour',
                smallestUnit: 'hours',
            },
        ];

        const intl = createIntl({locale: 'en-us'});

        testCases.forEach((testCase) => it(testCase.description, () => {
            expect(toHuman(intl, testCase.input, testCase.smallestUnit || 'seconds', testCase.opts || {})).toEqual(testCase.expected);
        }));
    });

    describe('callStartedTimestampFn', () => {
        const testCases = [
            {
                description: '0 seconds',
                input: Date.now(),
                expected: 'a few seconds ago',
            },
            {
                description: '43 seconds',
                input: Date.now() - (42.9 * 1000),
                expected: 'a few seconds ago',
            },
            {
                description: '44 seconds',
                input: Date.now() - (44 * 1000),
                expected: '1 minute ago',
            },
            {
                description: '1 minute',
                input: Date.now() - (1 * 60 * 1000),
                expected: '1 minute ago',
            },
            {
                description: '2 minutes',
                input: Date.now() - (2 * 60 * 1000),
                expected: '2 minutes ago',
            },
            {
                description: '59 minutes -> 59 minutes ago',
                input: Date.now() - Duration.fromObject({minutes: 59, seconds: 59}).toMillis(),
                expected: '59 minutes ago',
            },
            {
                description: '1 hour, 22 minutes -> 1 hour ago',
                input: Date.now() - Duration.fromObject({hours: 1, minutes: 22, seconds: 59}).toMillis(),
                expected: '1 hour ago',
            },
        ];

        const intl = createIntl({locale: 'en-us'});

        testCases.forEach((testCase) => it(testCase.description, () => {
            expect(callStartedTimestampFn(intl, testCase.input)).toEqual(testCase.expected);
        }));
    });

    describe('sleep', () => {
        test('500ms', async () => {
            const sleepTimeMs = 500;
            const toleranceMs = 10;
            const start = Date.now();
            await sleep(sleepTimeMs);
            expect(Date.now() - start).toBeGreaterThanOrEqual(sleepTimeMs - toleranceMs);
        });
    });

    describe('runWithRetry', () => {
        const failsN = (n: number) => {
            let failures = 0;
            return () => {
                if (failures === n) {
                    return 45;
                }
                failures++;
                throw new Error('request failed');
            };
        };

        test('single failure', async () => {
            expect(await runWithRetry(failsN(1))).toEqual(45);
        });

        test('multiple failures', async () => {
            expect(await runWithRetry(failsN(4))).toEqual(45);
        });

        test('with custom retry time', async () => {
            const start = Date.now();
            expect(await runWithRetry(failsN(1), 500)).toEqual(45);
            expect(Date.now() - start).toBeGreaterThan(500);
        });

        test('maximum attempts reached', async () => {
            await expect(runWithRetry(failsN(3), 10, 3)).rejects.toEqual(maxAttemptsReachedErr);
        });
    });

    describe('getCallPropsFromPost', () => {
        test('undefined props', () => {
            const post = {} as Post;

            const props = getCallPropsFromPost(post);

            expect(props.title).toBe('');
            expect(props.start_at).toBe(0);
            expect(props.end_at).toBe(0);
            expect(props.recordings).toStrictEqual({});
            expect(props.transcriptions).toStrictEqual({});
            expect(props.participants.length).toBe(0);
        });

        test('missing props', () => {
            const post = {
                props: {},
            } as Post;

            const props = getCallPropsFromPost(post);

            expect(props.title).toBe('');
            expect(props.start_at).toBe(0);
            expect(props.end_at).toBe(0);
            expect(props.recordings).toStrictEqual({});
            expect(props.transcriptions).toStrictEqual({});
            expect(props.participants.length).toBe(0);
        });

        test('invalid props', () => {
            const callProps = {
                title: {},
                start_at: 'invalid',
                end_at: [],
                recordings: null,
                transcriptions: 45,
                participants: 'invalid',
            };

            const post = {
                props: callProps as unknown,
            } as Post;

            const props = getCallPropsFromPost(post);

            expect(props.title).toBe('');
            expect(props.start_at).toBe(0);
            expect(props.end_at).toBe(0);
            expect(props.recordings).toStrictEqual({});
            expect(props.transcriptions).toStrictEqual({});
            expect(props.participants.length).toBe(0);
        });

        test('invalid job data', () => {
            const callProps = {
                recordings: {
                    recA: {
                        file_id: true,
                        post_id: null,
                        tr_id: 45,
                        rec_id: 45,
                    },
                    45: {
                    },
                    recB: {
                        file_id: 'recFileID',
                    },
                },
                transcriptions: {
                    trA: {
                        file_id: true,
                        post_id: null,
                        tr_id: 45,
                        rec_id: 45,
                    },
                    45: {
                    },
                    trB: {
                        file_id: 'trFileID',
                    },
                },
            };

            const post = {
                props: callProps as unknown,
            } as Post;

            const props = getCallPropsFromPost(post);

            expect(props.recordings).toStrictEqual({
                recA: {
                    file_id: '',
                    post_id: '',
                },
                45: {
                    file_id: '',
                    post_id: '',
                },
                recB: {
                    file_id: 'recFileID',
                    post_id: '',
                },
            });
            expect(props.transcriptions).toStrictEqual({
                trA: {
                    file_id: '',
                    post_id: '',
                },
                45: {
                    file_id: '',
                    post_id: '',
                },
                trB: {
                    file_id: 'trFileID',
                    post_id: '',
                },
            });
        });

        test('full props', () => {
            const callProps = {
                title: 'call title',
                start_at: 1000,
                end_at: 1045,
                recordings: {
                    recA: {
                        file_id: 'recAFileID',
                        post_id: 'recAPostID',
                        tr_id: 'trA',
                    },
                    recB: {
                        file_id: 'recBFileID',
                        post_id: 'recBPostID',
                        tr_id: 'trB',
                    },
                },
                transcriptions: {
                    trA: {
                        file_id: 'trAFileID',
                        post_id: 'trAPostID',
                        rec_id: 'recA',
                    },
                    trB: {
                        file_id: 'trBFileID',
                        post_id: 'trBPostID',
                        rec_id: 'recB',
                    },
                },
                participants: ['userA', 'userB'],
            };

            const post = {
                props: callProps as unknown,
            } as Post;

            const props = getCallPropsFromPost(post);

            expect(props.title).toBe(post.props.title);
            expect(props.start_at).toBe(post.props.start_at);
            expect(props.end_at).toBe(post.props.end_at);
            expect(props.recordings).toStrictEqual(post.props.recordings);
            expect(props.transcriptions).toStrictEqual(post.props.transcriptions);
            expect(props.participants).toBe(post.props.participants);
        });
    });

    describe('getCallRecordingPropsFromPost', () => {
        test('undefined props', () => {
            const post = {} as Post;

            const props = getCallRecordingPropsFromPost(post);

            expect(props.call_post_id).toBe('');
            expect(props.recording_id).toBe('');
            expect(props.captions.length).toBe(0);
        });

        test('missing props', () => {
            const post = {
                props: {},
            } as Post;

            const props = getCallRecordingPropsFromPost(post);

            expect(props.call_post_id).toBe('');
            expect(props.recording_id).toBe('');
            expect(props.captions.length).toBe(0);
        });

        test('invalid props', () => {
            const recProps = {
                call_post_id: 45,
                recording_id: {},
                captions: 'invalid',
            };

            const post = {
                props: recProps as unknown,
            } as Post;

            const props = getCallRecordingPropsFromPost(post);

            expect(props.call_post_id).toBe('');
            expect(props.recording_id).toBe('');
            expect(props.captions.length).toBe(0);
        });

        test('full props', () => {
            const recProps = {
                call_post_id: 'callPostID',
                recording_id: 'recA',
                captions: [
                    {
                        file_id: 'trAFileID',
                        language: 'en',
                        title: 'en',
                    },
                ],
            };

            const post = {
                props: recProps as unknown,
            } as Post;

            const props = getCallRecordingPropsFromPost(post);

            expect(props.call_post_id).toBe(recProps.call_post_id);
            expect(props.recording_id).toBe(recProps.recording_id);
            expect(props.captions).toBe(recProps.captions);
        });
    });

    describe('getCallsWindow', () => {
        test('basic', () => {
            const win = getCallsWindow();
            expect(win).toBe(window);
        });

        test('opener', () => {
            window.opener = {
                callsClient: true,
            };

            const win = getCallsWindow();
            expect(win).toBe(window.opener);
        });

        test('permission error on opener', () => {
            Object.defineProperty(window, 'opener', {
                get() {
                    throw new Error('Permission denied to access property "window"');
                },
            });

            const win = getCallsWindow();
            expect(win).toBe(window);

            delete window.opener;
        });
    });

    describe('getCallsClient', () => {
        test('undefined', () => {
            const callsClient = getCallsClient();
            expect(callsClient).toBeUndefined();
        });

        test('window.callsClient defined', () => {
            window.callsClient = {
                channelID: 'channelID',
            } as CallsClient;
            const callsClient = getCallsClient();
            expect(callsClient).toEqual(window.callsClient);
        });

        test('window.opener.callsClient defined', () => {
            global.window.opener = {
                callsClient: {
                    channelID: 'channelID',
                } as CallsClient,
            };
            const callsClient = getCallsClient();
            expect(callsClient).toEqual(window.opener.callsClient);
            delete global.window.opener;
        });

        test('undefined window', () => {
            const originalWindow = global.window;

            // @ts-ignore
            delete global.window;
            const callsClient = getCallsClient();
            expect(callsClient).toBeUndefined();
            global.window = originalWindow;
        });
    });

    describe('getWebappUtils', () => {
        test('undefined', () => {
            const utils = getWebappUtils();
            expect(utils).toBeUndefined();
        });

        test('window.WebappUtils defined', () => {
            // @ts-ignore
            global.window.WebappUtils = {};
            const utils = getWebappUtils();
            expect(utils).toEqual(window.WebappUtils);
        });

        test('window.opener.WebappUtils defined', () => {
            global.window.opener = {
                WebappUtils: {},
            };
            const utils = getWebappUtils();
            expect(utils).toEqual(window.opener.WebappUtils);
            delete global.window.opener;
        });

        test('undefined window', () => {
            const originalWindow = global.window;

            // @ts-ignore
            delete global.window;
            const utils = getWebappUtils();
            expect(utils).toBeUndefined();

            global.window = originalWindow;
        });
    });

    describe('shouldRenderCallsIncoming', () => {
        test('should render', () => {
            expect(shouldRenderCallsIncoming()).toBe(true);
        });

        test('window.opener', () => {
            global.window.opener = {};
            expect(shouldRenderCallsIncoming()).toBe(true);
            delete global.window.opener;
        });

        test('desktop expanded view', () => {
            const originalWindow = global.window;

            // @ts-ignore
            delete global.window;
            global.window = {
                location: {
                    pathname: `/plugins/${pluginId}/expanded/channelID`,
                } as Location,
                desktop: {},
            } as any;
            expect(shouldRenderCallsIncoming()).toBe(false);
            global.window = originalWindow;
        });

        test('undefined window', () => {
            const originalWindow = global.window;

            // @ts-ignore
            delete global.window;
            expect(shouldRenderCallsIncoming()).toBe(false);

            global.window = originalWindow;
        });
    });

    describe('getPlatformInfo', () => {
        const originalNavigator = window.navigator;
        beforeEach(() => {
        // Create a mock navigator object
            Object.defineProperty(window, 'navigator', {
                value: {
                    userAgent: '',
                    platform: '',
                },
                writable: true,
            });
        });

        afterEach(() => {
        // Restore the original navigator
            Object.defineProperty(window, 'navigator', {
                value: originalNavigator,
                writable: true,
            });
        });

        const platformTestCases = [
            {
                name: 'Windows using platform',
                platform: 'Win32',
                userAgent: '',
                expectedPlatform: 'Windows',
            },
            {
                name: 'MacOS using platform',
                platform: 'MacIntel',
                userAgent: '',
                expectedPlatform: 'MacOS',
            },
            {
                name: 'Linux using platform',
                platform: 'Linux x86_64',
                userAgent: '',
                expectedPlatform: 'Linux',
            },
            {
                name: 'Windows using userAgent',
                platform: '',
                userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
                expectedPlatform: 'Windows',
            },
            {
                name: 'MacOS using userAgent',
                platform: '',
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                expectedPlatform: 'MacOS',
            },
            {
                name: 'Linux using userAgent',
                platform: '',
                userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
                expectedPlatform: 'Linux',
            },
            {
                name: 'Unknown Platform',
                platform: '',
                userAgent: 'Some Unknown Platform',
                expectedPlatform: 'Unknown',
            },
        ];

        test.each(platformTestCases)(
            'should detect $name',
            ({platform, userAgent, expectedPlatform}) => {
                // @ts-expect-error we can override the platform in tests
                window.navigator.platform = platform;

                // @ts-expect-error we can override the userAgent in tests
                window.navigator.userAgent = userAgent;
                expect(getPlatformInfo()).toBe(expectedPlatform);
            },
        );
    });
});

