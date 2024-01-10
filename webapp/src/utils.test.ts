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
        test('1s', async () => {
            const sleepTimeMs = 500;
            const start = Date.now();
            await sleep(sleepTimeMs);
            expect(Date.now() - start).toBeGreaterThanOrEqual(sleepTimeMs);
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

            expect(props.start_at).toBeUndefined();
            expect(props.end_at).toBeUndefined();
            expect(props.recordings.length).toBe(0);
            expect(props.recording_files.length).toBe(0);
            expect(props.transcriptions.length).toBe(0);
            expect(props.participants.length).toBe(0);
        });

        test('missing props', () => {
            const post = {
                props: {},
            } as Post;

            const props = getCallPropsFromPost(post);

            expect(props.start_at).toBeUndefined();
            expect(props.end_at).toBeUndefined();
            expect(props.recordings.length).toBe(0);
            expect(props.recording_files.length).toBe(0);
            expect(props.transcriptions.length).toBe(0);
            expect(props.participants.length).toBe(0);
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
                recording_files: ['recAFileID', 'recBFileID'],
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
            expect(props.recordings).toBe(post.props.recordings);
            expect(props.recording_files).toBe(post.props.recording_files);
            expect(props.transcriptions).toBe(post.props.transcriptions);
            expect(props.participants).toBe(post.props.participants);
        });
    });

    describe('getCallRecordingPropsFromPost', () => {
        test('undefined props', () => {
            const post = {} as Post;

            const props = getCallRecordingPropsFromPost(post);

            expect(props.call_post_id).toBeUndefined();
            expect(props.recording_id).toBeUndefined();
            expect(props.captions.length).toBe(0);
        });

        test('missing props', () => {
            const post = {
                props: {},
            } as Post;

            const props = getCallRecordingPropsFromPost(post);

            expect(props.call_post_id).toBeUndefined();
            expect(props.recording_id).toBeUndefined();
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
});

