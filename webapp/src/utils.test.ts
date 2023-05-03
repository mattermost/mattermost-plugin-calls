import {Duration} from 'luxon';

import {
    getWSConnectionURL,
    shouldRenderDesktopWidget,
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
                expected: '0 seconds',
            },
            {
                description: '0 seconds short',
                input: Duration.fromMillis(0),
                expected: '0 sec',
                opts: {unitDisplay: 'short'},
            },
            {
                description: '18 seconds rounded, short',
                input: Duration.fromMillis(18999),
                expected: '18 sec',
                opts: {unitDisplay: 'short'},
            },
            {
                description: '4 min, 45 sec',
                input: Duration.fromObject({minutes: 4, seconds: 45}),
                expected: '4 min, 45 sec',
                opts: {unitDisplay: 'short'},
            },
            {
                description: '1 hour, 22 min, 59 sec',
                input: Duration.fromObject({hours: 1, minutes: 22, seconds: 59}),
                expected: '1 hr, 22 min, 59 sec',
                opts: {unitDisplay: 'short'},
            },
            {
                description: 'neg number = 0 sec',
                input: Duration.fromMillis(-23),
                expected: '0 sec',
                opts: {unitDisplay: 'short'},
            },
        ];

        testCases.forEach((testCase) => it(testCase.description, () => {
            expect(toHuman(testCase.input, 'seconds', testCase.opts || {})).toEqual(testCase.expected);
        }));
    });
});

