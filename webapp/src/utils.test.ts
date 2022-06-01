import {
    getWSConnectionURL,
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
});

