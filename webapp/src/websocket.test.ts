// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {WebSocketClient, WebSocketErrorType} from './websocket';

// Mock the manifest
jest.mock('./manifest', () => ({
    pluginId: 'com.mattermost.calls',
}));

// Mock WebSocket
class MockWebSocket {
    public readyState: number = WebSocket.CONNECTING;
    public onopen: ((event: Event) => void) | null = null;
    public onclose: ((event: CloseEvent) => void) | null = null;
    public onerror: ((event: Event) => void) | null = null;
    public onmessage: ((event: MessageEvent) => void) | null = null;
    public url: string;

    constructor(url: string) {
        this.url = url;
    }

    send(_: string | ArrayBuffer) {
        // Mock send implementation
    }

    close() {
        this.readyState = WebSocket.CLOSED;
        if (this.onclose) {
            this.onclose(new CloseEvent('close', {code: 1000}));
        }
    }
}

// Replace global WebSocket with mock
(global as any).WebSocket = MockWebSocket;
(global as any).WebSocket.CONNECTING = 0;
(global as any).WebSocket.OPEN = 1;
(global as any).WebSocket.CLOSING = 2;
(global as any).WebSocket.CLOSED = 3;

describe('WebSocketClient', () => {
    let client: WebSocketClient;
    let mockWebSocket: MockWebSocket;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        client = new WebSocketClient('ws://test.com');

        // Get reference to the mock WebSocket instance
        mockWebSocket = (client as any).ws;
    });

    afterEach(() => {
        client.close();
        jest.useRealTimers();
    });

    describe('constructor', () => {
        it('should initialize with correct URL and token', () => {
            expect(mockWebSocket.url).toContain('ws://test.com');
            expect(mockWebSocket.url).toContain('connection_id=');
            expect(mockWebSocket.url).toContain('sequence_number=0');
        });

        it('should set up event listeners', () => {
            expect(mockWebSocket.onopen).toBeDefined();
            expect(mockWebSocket.onclose).toBeDefined();
            expect(mockWebSocket.onerror).toBeDefined();
            expect(mockWebSocket.onmessage).toBeDefined();
        });
    });

    describe('connection handling', () => {
        it('should send authentication challenge on open when token provided', () => {
            client = new WebSocketClient('ws://test.com', 'test-token');
            mockWebSocket = (client as any).ws;

            const sendSpy = jest.spyOn(mockWebSocket, 'send');

            // Trigger onopen
            mockWebSocket.onopen!(new Event('open'));

            expect(sendSpy).toHaveBeenCalledWith(
                JSON.stringify({
                    action: 'authentication_challenge',
                    seq: 1,
                    data: {token: 'test-token'},
                }),
            );
        });

        it('should start ping interval on open', () => {
            const sendSpy = jest.spyOn(mockWebSocket, 'send');

            mockWebSocket.readyState = WebSocket.OPEN;
            mockWebSocket.onopen!(new Event('open'));

            // Initial ping.
            expect(sendSpy).toHaveBeenCalledWith(JSON.stringify({
                action: 'ping',
                seq: 1,
            }));

            // Simulate initial pong.
            mockWebSocket.onmessage!(new MessageEvent('message', {
                data: JSON.stringify({seq_reply: 1}),
            }));

            // Fast-forward to trigger ping interval.
            jest.advanceTimersByTime(5000);

            expect(sendSpy).toHaveBeenCalledWith(JSON.stringify({
                action: 'ping',
                seq: 2,
            }));
        });

        it('should emit open event on successful connection', () => {
            const openSpy = jest.fn();
            client.on('open', openSpy);

            // Simulate hello message
            const helloMessage = {
                event: 'hello',
                data: {connection_id: 'test-conn-id'},
                seq: 1,
            };

            mockWebSocket.onmessage!(new MessageEvent('message', {
                data: JSON.stringify(helloMessage),
            }));

            expect(openSpy).toHaveBeenCalledWith('test-conn-id', 'test-conn-id', false);
        });
    });

    describe('message handling', () => {
        beforeEach(() => {
            // Set up connection
            const helloMessage = {
                event: 'hello',
                data: {connection_id: 'test-conn-id'},
                seq: 1,
            };
            mockWebSocket.onmessage!(new MessageEvent('message', {
                data: JSON.stringify(helloMessage),
            }));
        });

        it('should handle valid JSON messages', () => {
            const eventSpy = jest.fn();
            client.on('event', eventSpy);

            const testMessage = {
                event: 'test_event',
                data: {test: 'data'},
                seq: 2,
            };

            mockWebSocket.onmessage!(new MessageEvent('message', {
                data: JSON.stringify(testMessage),
            }));

            expect(eventSpy).toHaveBeenCalledWith(testMessage);
        });

        it('should ignore invalid JSON messages', () => {
            const eventSpy = jest.fn();
            client.on('event', eventSpy);

            mockWebSocket.onmessage!(new MessageEvent('message', {
                data: 'invalid json',
            }));

            expect(eventSpy).not.toHaveBeenCalled();
        });

        it('should handle pong responses', () => {
            const sendSpy = jest.spyOn(mockWebSocket, 'send');

            mockWebSocket.readyState = WebSocket.OPEN;
            mockWebSocket.onopen!(new Event('open'));

            // Initial ping happened.

            // Simulate initial pong response
            mockWebSocket.onmessage!(new MessageEvent('message', {
                data: JSON.stringify({seq_reply: 1}),
            }));

            // Clear the initial ping call
            // sendSpy.mockClear();

            // Advance time to trigger a ping
            jest.advanceTimersByTime(5000);

            // Verify ping was sent and get the sequence number
            expect(sendSpy).toHaveBeenCalledWith(JSON.stringify({
                action: 'ping',
                seq: 2,
            }));

            // Simulate pong response with matching seq_reply
            const pongMessage = {
                seq_reply: 2,
            };

            mockWebSocket.onmessage!(new MessageEvent('message', {
                data: JSON.stringify(pongMessage),
            }));

            // Should not emit event for pong
            const eventSpy = jest.fn();
            client.on('event', eventSpy);
            expect(eventSpy).not.toHaveBeenCalled();

            // Verify waitingForPong state is cleared
            expect((client as any).waitingForPong).toBe(false);
            expect((client as any).expectedPongSeqNo).toBe(0);
        });

        it('should emit join event for plugin join messages', () => {
            const joinSpy = jest.fn();
            client.on('join', joinSpy);

            const joinMessage = {
                event: 'custom_com.mattermost.calls_join',
                data: {connID: 'test-conn-id'},
                seq: 2,
            };

            mockWebSocket.onmessage!(new MessageEvent('message', {
                data: JSON.stringify(joinMessage),
            }));

            expect(joinSpy).toHaveBeenCalled();
        });

        it('should emit error for plugin error messages', () => {
            const errorSpy = jest.fn();
            client.on('error', errorSpy);

            const errorMessage = {
                event: 'custom_com.mattermost.calls_error',
                data: {data: 'test error', connID: 'test-conn-id'},
                seq: 2,
            };

            mockWebSocket.onmessage!(new MessageEvent('message', {
                data: JSON.stringify(errorMessage),
            }));

            expect(errorSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: WebSocketErrorType.Join,
                    message: 'test error',
                }),
            );
        });

        it('should emit message for plugin signal messages', () => {
            const messageSpy = jest.fn();
            client.on('message', messageSpy);

            const signalMessage = {
                event: 'custom_com.mattermost.calls_signal',
                data: {test: 'signal data', connID: 'test-conn-id'},
                seq: 2,
            };

            mockWebSocket.onmessage!(new MessageEvent('message', {
                data: JSON.stringify(signalMessage),
            }));

            expect(messageSpy).toHaveBeenCalledWith({test: 'signal data', connID: 'test-conn-id'});
        });
    });

    describe('sending messages', () => {
        beforeEach(() => {
            // Set up connection
            mockWebSocket.readyState = WebSocket.OPEN;
            const helloMessage = {
                event: 'hello',
                data: {connection_id: 'test-conn-id'},
                seq: 1,
            };
            mockWebSocket.onmessage!(new MessageEvent('message', {
                data: JSON.stringify(helloMessage),
            }));
        });

        it('should send JSON messages when connection is open', () => {
            const sendSpy = jest.spyOn(mockWebSocket, 'send');

            client.send('test_action', {test: 'data'});

            expect(sendSpy).toHaveBeenCalledWith('{"action":"custom_com.mattermost.calls_test_action","seq":1,"data":{"test":"data"}}');
        });

        it('should send binary messages when binary flag is true', () => {
            const sendSpy = jest.spyOn(mockWebSocket, 'send');

            client.send('test_action', {test: 'data'}, true);

            expect(sendSpy).toHaveBeenCalledWith(expect.any(Uint8Array));
        });

        it('should not send when connection is not open', () => {
            const sendSpy = jest.spyOn(mockWebSocket, 'send');
            mockWebSocket.readyState = WebSocket.CONNECTING;

            client.send('test_action', {test: 'data'});

            expect(sendSpy).not.toHaveBeenCalled();
        });
    });

    describe('ping/pong handling', () => {
        beforeEach(() => {
            mockWebSocket.readyState = WebSocket.OPEN;
        });

        it('should ignore pong responses with wrong sequence number', () => {
            mockWebSocket.readyState = WebSocket.OPEN;
            mockWebSocket.onopen!(new Event('open'));

            // Initial ping happened.

            // Verify we're waiting for pong with seq 1
            expect((client as any).waitingForPong).toBe(true);
            expect((client as any).expectedPongSeqNo).toBe(1);

            // Simulate pong response with wrong seq_reply
            const wrongPongMessage = {
                seq_reply: 3,
            };

            mockWebSocket.onmessage!(new MessageEvent('message', {
                data: JSON.stringify(wrongPongMessage),
            }));

            // Should still be waiting for correct pong
            expect((client as any).waitingForPong).toBe(true);
            expect((client as any).expectedPongSeqNo).toBe(1);
        });

        it('should send ping at regular intervals', () => {
            mockWebSocket.readyState = WebSocket.OPEN;
            mockWebSocket.onopen!(new Event('open'));

            // Initial ping happened.

            // Simulate initial pong.
            mockWebSocket.onmessage!(new MessageEvent('message', {
                data: JSON.stringify({seq_reply: 1}),
            }));

            // Trigger next ping.
            jest.advanceTimersByTime(5000);

            // Verify expectedPongSeqNo is set
            expect((client as any).waitingForPong).toBe(true);
            expect((client as any).expectedPongSeqNo).toBe(2);
        });

        it('should reconnect on ping timeout', () => {
            const closeSpy = jest.spyOn(mockWebSocket, 'close');

            mockWebSocket.readyState = WebSocket.OPEN;
            mockWebSocket.onopen!(new Event('open'));

            // Simulate initial pong.
            mockWebSocket.onmessage!(new MessageEvent('message', {
                data: JSON.stringify({seq_reply: 1}),
            }));

            // Trigger second ping
            jest.advanceTimersByTime(5000);

            // Verify we're waiting for pong
            expect((client as any).waitingForPong).toBe(true);

            // Trigger second ping without pong response (timeout)
            jest.advanceTimersByTime(5000);

            expect(closeSpy).toHaveBeenCalled();
        });
    });

    describe('reconnection logic', () => {
        it('should attempt reconnection on close', () => {
            const initSpy = jest.spyOn(client as any, 'init');

            mockWebSocket.onclose!(new CloseEvent('close', {code: 1000}));

            jest.advanceTimersByTime(1000);

            expect(initSpy).toHaveBeenCalledWith(true);
        });

        it('should increase retry time on subsequent reconnections', () => {
            const initSpy = jest.spyOn(client as any, 'init');

            // First reconnection
            mockWebSocket.onclose!(new CloseEvent('close', {code: 1000}));
            jest.advanceTimersByTime(1000);
            expect(initSpy).toHaveBeenCalledTimes(1);

            // Second reconnection should take longer
            mockWebSocket.onclose!(new CloseEvent('close', {code: 1000}));
            jest.advanceTimersByTime(1000);
            expect(initSpy).toHaveBeenCalledTimes(1); // Should not have been called yet

            jest.advanceTimersByTime(500);
            expect(initSpy).toHaveBeenCalledTimes(2);
        });

        it('should emit error on reconnection timeout', () => {
            const errorSpy = jest.fn();
            client.on('error', errorSpy);

            // Set last disconnect time to simulate timeout
            (client as any).lastDisconnect = Date.now() - 31000; // 31 seconds ago

            client.reconnect();

            expect(errorSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: WebSocketErrorType.ReconnectTimeout,
                }),
            );
        });
    });

    describe('error handling', () => {
        it('should emit error on WebSocket error', () => {
            const errorSpy = jest.fn();
            client.on('error', errorSpy);

            mockWebSocket.onerror!(new Event('error'));

            expect(errorSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: WebSocketErrorType.Native,
                }),
            );
        });
    });

    describe('cleanup', () => {
        it('should clean up resources on close', () => {
            const removeAllListenersSpy = jest.spyOn(client, 'removeAllListeners');
            const closeSpy = jest.spyOn(mockWebSocket, 'close');

            client.close();

            expect(closeSpy).toHaveBeenCalled();
            expect(removeAllListenersSpy).toHaveBeenCalledWith('open');
            expect(removeAllListenersSpy).toHaveBeenCalledWith('event');
            expect(removeAllListenersSpy).toHaveBeenCalledWith('join');
            expect(removeAllListenersSpy).toHaveBeenCalledWith('close');
            expect(removeAllListenersSpy).toHaveBeenCalledWith('error');
            expect(removeAllListenersSpy).toHaveBeenCalledWith('message');
        });

        it('should reset internal state on close', () => {
            client.close();

            expect((client as any).ws).toBeNull();
            expect((client as any).seqNo).toBe(1);
            expect((client as any).serverSeqNo).toBe(0);
            expect((client as any).connID).toBe('');
            expect((client as any).originalConnID).toBe('');
            expect((client as any).closed).toBe(true);
            expect((client as any).expectedPongSeqNo).toBe(0);
        });

        it('should not attempt reconnection when closed', () => {
            const initSpy = jest.spyOn(client as any, 'init');

            client.close();
            mockWebSocket.onclose!(new CloseEvent('close', {code: 1000}));

            jest.advanceTimersByTime(5000);

            expect(initSpy).not.toHaveBeenCalled();
        });
    });

    describe('getOriginalConnID', () => {
        it('should return the original connection ID', () => {
            // Set up connection
            const helloMessage = {
                event: 'hello',
                data: {connection_id: 'test-conn-id'},
                seq: 1,
            };
            mockWebSocket.onmessage!(new MessageEvent('message', {
                data: JSON.stringify(helloMessage),
            }));

            expect(client.getOriginalConnID()).toBe('test-conn-id');
        });
    });
});
