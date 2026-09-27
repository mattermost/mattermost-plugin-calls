// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {getChannel as getChannelAction} from 'mattermost-redux/actions/channels';
import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {defineMessage} from 'react-intl';
import {displayCallsTestModeUser, displayGenericErrorModal, setClientConnecting} from 'src/actions';
import RestClient from 'src/clients/rest';
import {channelIDForCurrentCall, clientConnecting, defaultEnabled, sipOutboundEnabled} from 'src/selectors';
import {isCallsPopOut, isMobileBrowser, shouldRenderDesktopWidget} from 'src/utils';

import {
    dialPhoneNumber,
    installTelLinkInterceptor,
    parseTelHref,
    phoneCallErrorMessage,
    placePhoneCall,
    telLinkInterceptionSupported,
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
    isMobileBrowser: jest.fn(),
    shouldRenderDesktopWidget: jest.fn(),
}));

const mockedFetch = RestClient.fetch as jest.Mock;
const mockedGetChannelAction = getChannelAction as jest.Mock;
const mockedIsCurrentUserSystemAdmin = isCurrentUserSystemAdmin as unknown as jest.Mock;
const mockedDisplayCallsTestModeUser = displayCallsTestModeUser as unknown as jest.Mock;
const mockedDisplayGenericErrorModal = displayGenericErrorModal as unknown as jest.Mock;
const mockedSetClientConnecting = setClientConnecting as unknown as jest.Mock;
const mockedChannelIDForCurrentCall = channelIDForCurrentCall as jest.Mock;
const mockedClientConnecting = clientConnecting as jest.Mock;
const mockedDefaultEnabled = defaultEnabled as jest.Mock;
const mockedSipOutboundEnabled = sipOutboundEnabled as jest.Mock;
const mockedIsCallsPopOut = isCallsPopOut as jest.Mock;
const mockedIsMobileBrowser = isMobileBrowser as jest.Mock;
const mockedShouldRenderDesktopWidget = shouldRenderDesktopWidget as jest.Mock;

const setDesktopAPI = (desktopAPI?: unknown) => {
    (window as {desktopAPI?: unknown}).desktopAPI = desktopAPI;
};

describe('phone_call', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedIsCallsPopOut.mockReturnValue(false);
        mockedIsMobileBrowser.mockReturnValue(false);
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

            expect(onDial).toHaveBeenCalledWith('+15550100', {trunk: 'pstn'});
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
            {label: 'a mobile browser', setUp: () => mockedIsMobileBrowser.mockReturnValue(true)},
        ])('is not supported in $label', ({setUp}) => {
            setUp();

            expect(telLinkInterceptionSupported()).toBe(false);
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
    });
});
