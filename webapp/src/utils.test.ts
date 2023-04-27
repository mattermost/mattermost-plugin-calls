import {Duration} from 'luxon';

import {
    getWSConnectionURL,
    shouldRenderDesktopWidget,
    hexToRGB,
    rgbToHSL,
    hslToRGB,
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

    describe('hexToRGB', () => {
        const testCases = [
            {
                description: 'empty string',
                input: '',
                expected: {},
                error: 'invalid hex color string \'\'',
            },
            {
                description: 'missing shebang',
                input: '454545',
                expected: {},
                error: 'invalid hex color string \'454545\'',
            },
            {
                description: 'valid color (black)',
                input: '#000000',
                expected: {
                    r: 0,
                    g: 0,
                    b: 0,
                },
            },
            {
                description: 'valid color (white)',
                input: '#ffffff',
                expected: {
                    r: 255,
                    g: 255,
                    b: 255,
                },
            },
            {
                description: 'valid color',
                input: '#2D2D2D',
                expected: {
                    r: 45,
                    g: 45,
                    b: 45,
                },
            },
        ];

        testCases.forEach((testCase) => it(testCase.description, () => {
            if (testCase.error) {
                expect(() => hexToRGB(testCase.input)).toThrow(testCase.error);
            } else {
                expect(hexToRGB(testCase.input)).toEqual(testCase.expected);
            }
        }));
    });

    describe('rgbToHSL', () => {
        const testCases = [
            {
                description: 'black',
                input: {
                    r: 0,
                    g: 0,
                    b: 0,
                },
                expected: {
                    h: 0,
                    s: 0,
                    l: 0,
                },
            },
            {
                description: 'white',
                input: {
                    r: 255,
                    g: 255,
                    b: 255,
                },
                expected: {
                    h: 0,
                    s: 0,
                    l: 100,
                },
            },
            {
                description: 'red',
                input: {
                    r: 255,
                    g: 0,
                    b: 0,
                },
                expected: {
                    h: 0,
                    s: 100,
                    l: 50,
                },
            },
            {
                description: 'green',
                input: {
                    r: 0,
                    g: 255,
                    b: 0,
                },
                expected: {
                    h: 120,
                    s: 100,
                    l: 50,
                },
            },
            {
                description: 'blue',
                input: {
                    r: 0,
                    g: 0,
                    b: 255,
                },
                expected: {
                    h: 240,
                    s: 100,
                    l: 50,
                },
            },
            {
                description: 'orchid',
                input: {
                    r: 218,
                    g: 112,
                    b: 214,
                },
                expected: {
                    h: 302,
                    s: 59,
                    l: 65,
                },
            },
            {
                description: 'denim',
                input: {
                    r: 111,
                    g: 143,
                    b: 175,
                },
                expected: {
                    h: 210,
                    s: 29,
                    l: 56,
                },
            },
            {
                description: 'onyx',
                input: {
                    r: 53,
                    g: 57,
                    b: 53,
                },
                expected: {
                    h: 120,
                    s: 4,
                    l: 22,
                },
            },
        ];

        testCases.forEach((testCase) => it(testCase.description, () => {
            expect(rgbToHSL(testCase.input)).toEqual(testCase.expected);
        }));
    });

    describe('hslToRGB', () => {
        const testCases = [
            {
                description: 'black',
                input: {
                    h: 0,
                    s: 0,
                    l: 0,
                },
                expected: {
                    r: 0,
                    g: 0,
                    b: 0,
                },
            },
            {
                description: 'white',
                input: {
                    h: 0,
                    s: 0,
                    l: 100,
                },
                expected: {
                    r: 255,
                    g: 255,
                    b: 255,
                },
            },
            {
                description: 'red',
                input: {
                    h: 0,
                    s: 100,
                    l: 50,
                },
                expected: {
                    r: 255,
                    g: 0,
                    b: 0,
                },
            },
            {
                description: 'green',
                input: {
                    h: 120,
                    s: 100,
                    l: 50,
                },
                expected: {
                    r: 0,
                    g: 255,
                    b: 0,
                },
            },
            {
                description: 'blue',
                input: {
                    h: 240,
                    s: 100,
                    l: 50,
                },
                expected: {
                    r: 0,
                    g: 0,
                    b: 255,
                },
            },
            {
                description: 'orchid',
                input: {
                    h: 302,
                    s: 59,
                    l: 65,
                },
                expected: {
                    r: 218,
                    g: 113,
                    b: 215,
                },
            },
            {
                description: 'denim',
                input: {
                    h: 210,
                    s: 29,
                    l: 56,
                },
                expected: {
                    r: 110,
                    g: 143,
                    b: 175,
                },
            },
            {
                description: 'onyx',
                input: {
                    h: 120,
                    s: 4,
                    l: 22,
                },
                expected: {
                    r: 54,
                    g: 58,
                    b: 54,
                },
            },
        ];

        testCases.forEach((testCase) => it(testCase.description, () => {
            expect(hslToRGB(testCase.input)).toEqual(testCase.expected);
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

