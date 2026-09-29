// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {EventEmitter} from 'events';
import {DisconnectReason} from 'livekit-client';
import {getChannel as getChannelAction} from 'mattermost-redux/actions/channels';
import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {defineMessage} from 'react-intl';
import {
    displayCallsTestModeUser,
    displayGenericErrorModal,
    getCallsConfig,
    hostEndCallForEveryone,
    setClientConnecting,
} from 'src/actions';
import type CallClient from 'src/clients/call/call_client';
import {CALL_EVENT} from 'src/clients/call/constants';
import RestClient from 'src/clients/rest';
import {channelIDForCurrentCall, clientConnecting, defaultEnabled, sipOutboundEnabled} from 'src/selectors';
import {isCallsPopOut, isMobile, shouldRenderDesktopWidget} from 'src/utils';

import {
    dialPhoneNumber,
    installTelLinkInterceptor,
    openInOSDialer,
    parseTelHref,
    phoneCallErrorMessage,
    placePhoneCall,
    registerTelLinkDialing,
    telLinkInterceptionSupported,
    watchPhoneCall,
} from './phone_call';

jest.mock('mattermost-redux/actions/channels', () => ({
    getChannel: jest.fn((channelID) => ({type: 'mock/getChannel', channelID})),
}));
jest.mock('mattermost-redux/selectors/entities/users', () => ({
    ...jest.requireActual('mattermost-redux/selectors/entities/users'),
    isCurrentUserSystemAdmin: jest.fn(),
}));
jest.mock('src/actions', () => ({
    displayCallsTestModeUser: jest.fn(() => ({type: 'mock/displayCallsTestModeUser'})),
    displayGenericErrorModal: jest.fn((title, message) => ({type: 'mock/displayGenericErrorModal', title, message})),
    getCallsConfig: jest.fn(() => ({type: 'mock/getCallsConfig'})),
    hostEndCallForEveryone: jest.fn(),
    setClientConnecting: jest.fn((value) => ({type: 'mock/setClientConnecting', value})),
}));
jest.mock('src/clients/rest', () => ({
    __esModule: true,
    default: {
        fetch: jest.fn(),
    },
}));
jest.mock('src/log', () => ({
    ...jest.requireActual('src/log'),
    logErr: jest.fn(),
}));
jest.mock('src/selectors', () => ({
    channelIDForCurrentCall: jest.fn(),
    clientConnecting: jest.fn(),
    defaultEnabled: jest.fn(),
    sipOutboundEnabled: jest.fn(),
}));
jest.mock('src/utils', () => ({
    ...jest.requireActual('src/utils'),
    isCallsPopOut: jest.fn(),
    isMobile: jest.fn(),
    shouldRenderDesktopWidget: jest.fn(),
}));

const mockedFetch = RestClient.fetch as jest.Mock;
const mockedGetChannelAction = getChannelAction as jest.Mock;
const mockedIsCurrentUserSystemAdmin = isCurrentUserSystemAdmin as unknown as jest.Mock;
const mockedDisplayCallsTestModeUser = displayCallsTestModeUser as unknown as jest.Mock;
const mockedDisplayGenericErrorModal = displayGenericErrorModal as unknown as jest.Mock;
const mockedSetClientConnecting = setClientConnecting as unknown as jest.Mock;
const mockedGetCallsConfig = getCallsConfig as unknown as jest.Mock;
const mockedHostEndCallForEveryone = hostEndCallForEveryone as jest.Mock;
const mockedChannelIDForCurrentCall = channelIDForCurrentCall as jest.Mock;
const mockedClientConnecting = clientConnecting as jest.Mock;
const mockedDefaultEnabled = defaultEnabled as jest.Mock;
const mockedSipOutboundEnabled = sipOutboundEnabled as jest.Mock;
const mockedIsCallsPopOut = isCallsPopOut as jest.Mock;
const mockedIsMobile = isMobile as jest.Mock;
const mockedShouldRenderDesktopWidget = shouldRenderDesktopWidget as jest.Mock;

const setDesktopAPI = (desktopAPI?: unknown) => {
    (window as {desktopAPI?: unknown}).desktopAPI = desktopAPI;
};

describe('phone_call', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedIsCallsPopOut.mockReturnValue(false);
        mockedIsMobile.mockReturnValue(false);
        mockedShouldRenderDesktopWidget.mockReturnValue(false);
        mockedSipOutboundEnabled.mockReturnValue(true);
        mockedDefaultEnabled.mockReturnValue(true);
        mockedIsCurrentUserSystemAdmin.mockReturnValue(false);
        mockedChannelIDForCurrentCall.mockReturnValue('');
        mockedClientConnecting.mockReturnValue(false);
    });

    afterEach(() => {
        setDesktopAPI(undefined);
    });

    describe('parseTelHref', () => {
        it('returns the number when there are no parameters', () => {
            expect(parseTelHref('tel:+15551234567')).toEqual({number: '+15551234567', params: {}});
        });

        it('keeps only the parameters the server re-authorizes', () => {
            expect(parseTelHref('tel:101;phone-context=green-pbx;trunk=red-pbx;field=abc123;user_id=someone')).toEqual({
                number: '101',
                params: {'phone-context': 'green-pbx', trunk: 'red-pbx', field: 'abc123'},
            });
        });

        it('decodes a percent-encoded number so the escapes do not become digits', () => {
            expect(parseTelHref('tel:+1%20555%20123%204567').number).toBe('+1 555 123 4567');
        });

        it('keeps a malformed escape as-is instead of throwing', () => {
            expect(parseTelHref('tel:555%E0%A4%A').number).toBe('555%E0%A4%A');
        });

        it('returns an empty number for a bare tel: link', () => {
            expect(parseTelHref('tel:').number).toBe('');
        });
    });

    describe('phoneCallErrorMessage', () => {
        it.each([
            ['invalid_number', defineMessage({defaultMessage: 'That doesn\'t look like a valid phone number.'})],
            ['sip_number_not_allowed', defineMessage({defaultMessage: 'Calling this number isn\'t permitted.'})],
            ['sip_team_not_allowed', defineMessage({defaultMessage: 'You don\'t have permission to place phone calls.'})],
            ['outbound_disabled', defineMessage({defaultMessage: 'Phone calls aren\'t available. Contact your system admin.'})],
            ['outbound_not_configured', defineMessage({defaultMessage: 'Phone calls aren\'t available. Contact your system admin.'})],
            ['call_in_progress', defineMessage({defaultMessage: 'You\'re already on a phone call.'})],
        ])('maps the %s server error to its message', (id, message) => {
            expect(phoneCallErrorMessage({server_error_id: id})).toEqual(message);
        });

        it.each([
            ['the dial_failed server error', {server_error_id: 'dial_failed'}],
            ['an unknown server error', {server_error_id: 'something_else'}],
            ['an id that is an Object prototype key', {server_error_id: 'constructor'}],
            ['an error without an id', new Error('network down')],
            ['no error at all', undefined],
        ])('falls back to the generic message for %s', (_label, err) => {
            expect(phoneCallErrorMessage(err)).toEqual(defineMessage({defaultMessage: 'The call couldn\'t be placed. Please try again.'}));
        });
    });

    describe('placePhoneCall', () => {
        it('posts the number to the phone-call endpoint', async () => {
            mockedFetch.mockResolvedValueOnce({channel_id: 'bot-dm'});

            await placePhoneCall('+15550100');

            expect(mockedFetch).toHaveBeenCalledWith(
                expect.stringMatching(/\/plugins\/com\.mattermost\.calls\/phone-call$/),
                {method: 'post', body: JSON.stringify({number: '+15550100'})},
            );
        });
    });

    describe('installTelLinkInterceptor', () => {
        let container: HTMLDivElement;
        let coreHandler: jest.Mock;

        const addLink = (href: string) => {
            const link = document.createElement('a');
            link.setAttribute('href', href);
            link.appendChild(document.createElement('span'));
            container.appendChild(link);
            return link;
        };

        const click = (target: Element) => {
            const event = new MouseEvent('click', {bubbles: true, cancelable: true});
            target.dispatchEvent(event);
            return event;
        };

        beforeEach(() => {
            container = document.createElement('div');
            document.body.appendChild(container);

            // Stands in for core's handler; preventing the default keeps jsdom from navigating.
            coreHandler = jest.fn((e: Event) => e.preventDefault());
            container.addEventListener('click', coreHandler);
        });

        afterEach(() => {
            container.remove();
        });

        it('dials a clicked tel: link and stops the click from reaching core', () => {
            const link = addLink('tel:+15550100;trunk=pstn');
            const onDial = jest.fn();
            const uninstall = installTelLinkInterceptor(onDial);

            const event = click(link.querySelector('span') as Element);
            uninstall();

            expect(onDial).toHaveBeenCalledWith('+15550100', {trunk: 'pstn'}, 'tel:+15550100;trunk=pstn');
            expect(event.defaultPrevented).toBe(true);
            expect(coreHandler).not.toHaveBeenCalled();
        });

        it('leaves other links to core', () => {
            const link = addLink('https://example.com');
            const onDial = jest.fn();
            const uninstall = installTelLinkInterceptor(onDial);

            click(link);
            uninstall();

            expect(onDial).not.toHaveBeenCalled();
            expect(coreHandler).toHaveBeenCalled();
        });

        it('leaves a tel: link with no number to core', () => {
            const link = addLink('tel:');
            const onDial = jest.fn();
            const uninstall = installTelLinkInterceptor(onDial);

            click(link);
            uninstall();

            expect(onDial).not.toHaveBeenCalled();
            expect(coreHandler).toHaveBeenCalled();
        });

        it('stops intercepting once uninstalled', () => {
            const link = addLink('tel:+15550100');
            const onDial = jest.fn();
            installTelLinkInterceptor(onDial)();

            click(link);

            expect(onDial).not.toHaveBeenCalled();
            expect(coreHandler).toHaveBeenCalled();
        });
    });

    describe('telLinkInterceptionSupported', () => {
        it('is supported in a browser outside the expanded-view pop-out', () => {
            expect(telLinkInterceptionSupported()).toBe(true);
        });

        it.each([
            {label: 'the Desktop app', setUp: () => setDesktopAPI({joinCall: jest.fn()})},
            {label: 'a legacy Desktop app', setUp: () => mockedShouldRenderDesktopWidget.mockReturnValue(true)},
            {label: 'the expanded-view pop-out', setUp: () => mockedIsCallsPopOut.mockReturnValue(true)},
            {label: 'a mobile browser', setUp: () => mockedIsMobile.mockReturnValue(true)},
        ])('is not supported in $label', ({setUp}) => {
            setUp();

            expect(telLinkInterceptionSupported()).toBe(false);
        });
    });

    describe('openInOSDialer', () => {
        it('opens the tel: link in a new tab, as core would', () => {
            const openSpy = jest.spyOn(window, 'open').mockReturnValue(null);

            openInOSDialer('tel:+15550100');

            expect(openSpy).toHaveBeenCalledWith('tel:+15550100', '_blank', 'noreferrer');
            openSpy.mockRestore();
        });
    });

    describe('dialPhoneNumber', () => {
        const phoneCallResponse = {
            session_id: 'phone-session',
            token: 'phone-token',
            url: 'wss://phone.url',
            call_id: 'call-id',
            channel_id: 'bot-dm',
            sip_call_id: 'SCL_123',
            call_state: {id: 'call-id'},
        };
        const errorTitle = defineMessage({defaultMessage: 'Unable to place phone call'});

        const makeStore = () => ({
            dispatch: jest.fn(),
            getState: jest.fn(() => ({})),
        });

        it('places the call, loads the bot DM and joins with the returned session', async () => {
            mockedFetch.mockResolvedValueOnce(phoneCallResponse);
            const store = makeStore();
            const connect = jest.fn();

            await dialPhoneNumber(store as never, '+15550100', connect);

            expect(mockedSetClientConnecting).toHaveBeenCalledWith(true);
            expect(mockedFetch).toHaveBeenCalledWith(expect.stringMatching(/\/phone-call$/), expect.anything());
            expect(mockedGetChannelAction).toHaveBeenCalledWith('bot-dm');
            expect(store.dispatch).toHaveBeenCalledWith(mockedGetChannelAction.mock.results[0].value);
            expect(connect).toHaveBeenCalledWith('bot-dm', phoneCallResponse);
            expect(mockedDisplayGenericErrorModal).not.toHaveBeenCalled();
        });

        it('shows the mapped error and clears connecting when the server rejects the call', async () => {
            mockedFetch.mockRejectedValueOnce({server_error_id: 'sip_number_not_allowed', status_code: 403});
            const connect = jest.fn();

            await dialPhoneNumber(makeStore() as never, '+15550100', connect);

            expect(mockedSetClientConnecting).toHaveBeenLastCalledWith(false);
            expect(mockedDisplayGenericErrorModal).toHaveBeenCalledWith(
                errorTitle,
                defineMessage({defaultMessage: 'Calling this number isn\'t permitted.'}),
            );
            expect(connect).not.toHaveBeenCalled();
        });

        it.each([
            {
                label: 'outbound dialing is disabled',
                setUp: () => mockedSipOutboundEnabled.mockReturnValue(false),
                message: defineMessage({defaultMessage: 'Phone calls aren\'t available. Contact your system admin.'}),
            },
            {
                label: 'the user is already in a call',
                setUp: () => mockedChannelIDForCurrentCall.mockReturnValue('other-channel'),
                message: defineMessage({defaultMessage: 'You\'re already in a call. Leave it before placing a phone call.'}),
            },
            {
                label: 'running in the Desktop app',
                setUp: () => setDesktopAPI({joinCall: jest.fn()}),
                message: defineMessage({defaultMessage: 'Phone calls aren\'t supported in the desktop app yet.'}),
            },
        ])('does not dial when $label', async ({setUp, message}) => {
            setUp();
            const connect = jest.fn();

            await dialPhoneNumber(makeStore() as never, '+15550100', connect);

            expect(mockedDisplayGenericErrorModal).toHaveBeenCalledWith(errorTitle, message);
            expect(mockedFetch).not.toHaveBeenCalled();
            expect(connect).not.toHaveBeenCalled();
        });

        it('shows the test-mode prompt to a non-admin when calls are off by default', async () => {
            mockedDefaultEnabled.mockReturnValue(false);

            await dialPhoneNumber(makeStore() as never, '+15550100', jest.fn());

            expect(mockedDisplayCallsTestModeUser).toHaveBeenCalled();
            expect(mockedFetch).not.toHaveBeenCalled();
        });

        it('lets a system admin dial when calls are off by default', async () => {
            mockedDefaultEnabled.mockReturnValue(false);
            mockedIsCurrentUserSystemAdmin.mockReturnValue(true);
            mockedFetch.mockResolvedValueOnce(phoneCallResponse);
            const connect = jest.fn();

            await dialPhoneNumber(makeStore() as never, '+15550100', connect);

            expect(connect).toHaveBeenCalledWith('bot-dm', phoneCallResponse);
        });

        it('does nothing while another join is in progress', async () => {
            mockedClientConnecting.mockReturnValue(true);
            const store = makeStore();

            await dialPhoneNumber(store as never, '+15550100', jest.fn());

            expect(store.dispatch).not.toHaveBeenCalled();
            expect(mockedFetch).not.toHaveBeenCalled();
        });

        describe('when the server says outbound dialing is unavailable', () => {
            const unavailableMessage = defineMessage({defaultMessage: 'Phone calls aren\'t available. Contact your system admin.'});
            const telHref = 'tel:+15550100';
            let openSpy: jest.SpyInstance;

            const dialFromTelLink = (store: ReturnType<typeof makeStore>) => dialPhoneNumber(store as never, '+15550100', jest.fn(), () => openInOSDialer(telHref));

            beforeEach(() => {
                openSpy = jest.spyOn(window, 'open').mockReturnValue(null);
            });

            afterEach(() => {
                openSpy.mockRestore();
            });

            it('refetches the config and opens a tel: link in the OS dialer when dialing was turned off', async () => {
                mockedFetch.mockRejectedValueOnce({server_error_id: 'outbound_disabled', status_code: 400});
                const store = makeStore();

                await dialFromTelLink(store);

                expect(store.dispatch).toHaveBeenCalledWith(mockedGetCallsConfig.mock.results[0].value);
                expect(mockedSetClientConnecting).toHaveBeenLastCalledWith(false);
                expect(openSpy).toHaveBeenCalledWith(telHref, '_blank', 'noreferrer');
                expect(mockedDisplayGenericErrorModal).not.toHaveBeenCalled();
            });

            it('shows the error for a tel: link instead of opening the OS dialer when no trunk is configured', async () => {
                mockedFetch.mockRejectedValueOnce({server_error_id: 'outbound_not_configured', status_code: 400});

                await dialFromTelLink(makeStore());

                expect(mockedDisplayGenericErrorModal).toHaveBeenCalledWith(errorTitle, unavailableMessage);
                expect(mockedSetClientConnecting).toHaveBeenLastCalledWith(false);
                expect(openSpy).not.toHaveBeenCalled();
                expect(mockedGetCallsConfig).not.toHaveBeenCalled();
            });

            it.each(['outbound_disabled', 'outbound_not_configured'])('shows the error for /call dial when the server says %s', async (id) => {
                mockedFetch.mockRejectedValueOnce({server_error_id: id, status_code: 400});

                await dialPhoneNumber(makeStore() as never, '+15550100', jest.fn());

                expect(mockedDisplayGenericErrorModal).toHaveBeenCalledWith(errorTitle, unavailableMessage);
                expect(openSpy).not.toHaveBeenCalled();
            });
        });

        it('does not refetch the config for other server errors', async () => {
            mockedFetch.mockRejectedValueOnce({server_error_id: 'dial_failed', status_code: 500});
            const onOutboundUnavailable = jest.fn();

            await dialPhoneNumber(makeStore() as never, '+15550100', jest.fn(), onOutboundUnavailable);

            expect(mockedGetCallsConfig).not.toHaveBeenCalled();
            expect(onOutboundUnavailable).not.toHaveBeenCalled();
            expect(mockedDisplayGenericErrorModal).toHaveBeenCalled();
        });

        it('hands off without dialing when outbound dialing is already known to be off', async () => {
            mockedSipOutboundEnabled.mockReturnValue(false);
            const onOutboundUnavailable = jest.fn();

            await dialPhoneNumber(makeStore() as never, '+15550100', jest.fn(), onOutboundUnavailable);

            expect(onOutboundUnavailable).toHaveBeenCalled();
            expect(mockedDisplayGenericErrorModal).not.toHaveBeenCalled();
            expect(mockedFetch).not.toHaveBeenCalled();
        });
    });

    describe('registerTelLinkDialing', () => {
        let onStoreChange: () => void;
        let store: {dispatch: jest.Mock; getState: jest.Mock; subscribe: jest.Mock};
        let unsubscribe: jest.Mock;
        let addListenerSpy: jest.SpyInstance;
        let removeListenerSpy: jest.SpyInstance;

        const telClickListeners = (spy: jest.SpyInstance) => spy.mock.calls.filter(([type, , capture]) => type === 'click' && capture === true);

        beforeEach(() => {
            unsubscribe = jest.fn();
            store = {
                dispatch: jest.fn(),
                getState: jest.fn(() => ({})),
                subscribe: jest.fn((listener) => {
                    onStoreChange = listener;
                    return unsubscribe;
                }),
            };
            addListenerSpy = jest.spyOn(document, 'addEventListener');
            removeListenerSpy = jest.spyOn(document, 'removeEventListener');
        });

        afterEach(() => {
            addListenerSpy.mockRestore();
            removeListenerSpy.mockRestore();
        });

        it('intercepts tel: links only while outbound dialing is enabled', () => {
            registerTelLinkDialing(store as never, jest.fn());

            onStoreChange();
            onStoreChange();
            expect(telClickListeners(addListenerSpy)).toHaveLength(1);

            mockedSipOutboundEnabled.mockReturnValue(false);
            onStoreChange();
            expect(telClickListeners(removeListenerSpy)).toEqual([['click', telClickListeners(addListenerSpy)[0][1], true]]);
        });

        it('stops watching and removes the interceptor on cleanup', () => {
            const cleanup = registerTelLinkDialing(store as never, jest.fn());
            onStoreChange();

            cleanup();

            expect(unsubscribe).toHaveBeenCalled();
            expect(telClickListeners(removeListenerSpy)).toHaveLength(1);
        });

        it('leaves tel: links alone where interception is not supported', () => {
            setDesktopAPI({joinCall: jest.fn()});

            registerTelLinkDialing(store as never, jest.fn());
            onStoreChange();

            expect(telClickListeners(addListenerSpy)).toHaveLength(0);
        });
    });

    describe('watchPhoneCall', () => {
        const dialFailed = defineMessage({defaultMessage: 'The call couldn\'t be placed. Please try again.'});

        class FakeClient extends EventEmitter {
            isConnected = true;
            hasSIPParticipant = jest.fn(() => true);
            disconnect = jest.fn(() => {
                this.emit(CALL_EVENT.DISCONNECTING);
                this.emit(CALL_EVENT.DISCONNECTED, DisconnectReason.CLIENT_INITIATED);
                return Promise.resolve();
            });
        }

        let client: FakeClient;
        let store: {dispatch: jest.Mock; getState: jest.Mock};

        const watch = (connecting: Promise<void> = Promise.resolve()) => watchPhoneCall(store as never, client as unknown as CallClient, 'bot-dm', connecting);

        beforeEach(() => {
            jest.useFakeTimers();
            client = new FakeClient();
            store = {dispatch: jest.fn(), getState: jest.fn(() => ({}))};
            mockedHostEndCallForEveryone.mockResolvedValue({});
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('ends the call on the server as soon as the caller starts leaving', () => {
            watch();

            client.emit(CALL_EVENT.DISCONNECTING);
            expect(mockedHostEndCallForEveryone).toHaveBeenCalledWith('bot-dm');

            client.emit(CALL_EVENT.DISCONNECTED, DisconnectReason.CLIENT_INITIATED);
            expect(mockedHostEndCallForEveryone).toHaveBeenCalledTimes(1);
        });

        it('ends the call on the server when the caller is disconnected without leaving', () => {
            watch();

            client.emit(CALL_EVENT.DISCONNECTED, DisconnectReason.CLIENT_INITIATED);

            expect(mockedHostEndCallForEveryone).toHaveBeenCalledWith('bot-dm');
        });

        it('does not end the call again when the server already deleted the room', () => {
            watch();

            client.emit(CALL_EVENT.DISCONNECTED, DisconnectReason.ROOM_DELETED);

            expect(mockedHostEndCallForEveryone).not.toHaveBeenCalled();
        });

        it('ends the call when the join fails', async () => {
            const connecting = Promise.reject(new Error('join failed'));
            watch(connecting);

            await connecting.catch(() => {});

            expect(mockedHostEndCallForEveryone).toHaveBeenCalledWith('bot-dm');
        });

        it('ends the call when the caller cancels before joining', async () => {
            client.isConnected = false;
            const connecting = Promise.resolve();
            watch(connecting);

            await connecting;

            expect(mockedHostEndCallForEveryone).toHaveBeenCalledWith('bot-dm');
        });

        it('keeps the call once the join succeeds', async () => {
            const connecting = Promise.resolve();
            watch(connecting);

            await connecting;

            expect(mockedHostEndCallForEveryone).not.toHaveBeenCalled();
        });

        it('ends the call only once', async () => {
            const connecting = Promise.reject(new Error('join failed'));
            watch(connecting);

            await connecting.catch(() => {});
            client.emit(CALL_EVENT.DISCONNECTED, DisconnectReason.CLIENT_INITIATED);

            expect(mockedHostEndCallForEveryone).toHaveBeenCalledTimes(1);
        });

        it('hangs up when the phone leg leaves', () => {
            watch();
            client.emit(CALL_EVENT.CONNECTED);
            client.hasSIPParticipant.mockReturnValue(false);

            client.emit(CALL_EVENT.USER_LEFT, 'sip:+15550100', '');

            expect(client.disconnect).toHaveBeenCalled();
            expect(mockedHostEndCallForEveryone).toHaveBeenCalledTimes(1);
            expect(mockedHostEndCallForEveryone).toHaveBeenCalledWith('bot-dm');
        });

        it('stays in the call when someone other than the phone leg leaves', () => {
            watch();
            client.emit(CALL_EVENT.CONNECTED);

            client.emit(CALL_EVENT.USER_LEFT, 'session', 'user');

            expect(client.disconnect).not.toHaveBeenCalled();
        });

        it('reports a failed dial when the phone leg is already gone after joining', () => {
            watch();
            client.hasSIPParticipant.mockReturnValue(false);
            client.emit(CALL_EVENT.CONNECTED);

            jest.advanceTimersByTime(4999);
            expect(client.disconnect).not.toHaveBeenCalled();

            jest.advanceTimersByTime(1);
            expect(mockedDisplayGenericErrorModal).toHaveBeenCalledWith(
                defineMessage({defaultMessage: 'Unable to place phone call'}),
                dialFailed,
            );
            expect(client.disconnect).toHaveBeenCalled();
            expect(mockedHostEndCallForEveryone).toHaveBeenCalledTimes(1);
            expect(mockedHostEndCallForEveryone).toHaveBeenCalledWith('bot-dm');
        });

        it('keeps the call when the phone leg shows up within the grace period', () => {
            watch();
            client.emit(CALL_EVENT.CONNECTED);

            jest.advanceTimersByTime(5000);

            expect(client.disconnect).not.toHaveBeenCalled();
            expect(mockedDisplayGenericErrorModal).not.toHaveBeenCalled();
        });

        it('does not report a failed dial after the caller has left', () => {
            watch();
            client.hasSIPParticipant.mockReturnValue(false);
            client.emit(CALL_EVENT.CONNECTED);
            client.emit(CALL_EVENT.DISCONNECTED, DisconnectReason.CLIENT_INITIATED);

            jest.advanceTimersByTime(5000);

            expect(mockedDisplayGenericErrorModal).not.toHaveBeenCalled();
        });
    });
});
