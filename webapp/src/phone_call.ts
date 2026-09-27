// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ClientError} from '@mattermost/client';
import {getChannel as getChannelAction} from 'mattermost-redux/actions/channels';
import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {defineMessage, MessageDescriptor} from 'react-intl';
import {displayCallsTestModeUser, displayGenericErrorModal, setClientConnecting} from 'src/actions';
import type {LiveKitSessionResponse} from 'src/clients/call/types';
import RestClient from 'src/clients/rest';
import {logErr} from 'src/log';
import {channelIDForCurrentCall, clientConnecting, defaultEnabled, sipOutboundEnabled} from 'src/selectors';
import type {Store} from 'src/types/mattermost-webapp';
import {getPluginPath, isCallsPopOut, isMobileBrowser, shouldRenderDesktopWidget} from 'src/utils';

export type PhoneCallResponse = LiveKitSessionResponse & {
    call_id: string;
    channel_id: string;
    sip_call_id: string;
};

export type TelParams = {
    trunk?: string;
    'phone-context'?: string;
    field?: string;
};

const allowedTelParams: ReadonlyArray<keyof TelParams> = ['trunk', 'phone-context', 'field'];

const dialErrorTitle = defineMessage({defaultMessage: 'Unable to place phone call'});
const dialFailedMessage = defineMessage({defaultMessage: 'The call couldn\'t be placed. Please try again.'});
const outboundUnavailableMessage = defineMessage({defaultMessage: 'Phone calls aren\'t available. Contact your system admin.'});

const serverErrorMessages = new Map<string, MessageDescriptor>([
    ['invalid_number', defineMessage({defaultMessage: 'That doesn\'t look like a valid phone number.'})],
    ['sip_number_not_allowed', defineMessage({defaultMessage: 'Calling this number isn\'t permitted.'})],
    ['sip_team_not_allowed', defineMessage({defaultMessage: 'You don\'t have permission to place phone calls.'})],
    ['outbound_disabled', outboundUnavailableMessage],
    ['outbound_not_configured', outboundUnavailableMessage],
    ['call_in_progress', defineMessage({defaultMessage: 'You\'re already on a phone call.'})],
]);

export function placePhoneCall(number: string) {
    return RestClient.fetch<PhoneCallResponse>(
        `${getPluginPath()}/phone-call`,
        {method: 'post', body: JSON.stringify({number})},
    );
}

export function phoneCallErrorMessage(err: unknown): MessageDescriptor {
    const id = (err as Partial<ClientError> | undefined)?.server_error_id;
    return (id && serverErrorMessages.get(id)) || dialFailedMessage;
}

function safeDecodeURIComponent(value: string) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

// Only parameters the server re-authorizes are kept, since a tel: link can be
// authored by anyone.
export function parseTelHref(href: string): {number: string; params: TelParams} {
    const [rawNumber, ...rawParams] = href.replace(/^tel:/i, '').split(';');

    const params: TelParams = {};
    for (const rawParam of rawParams) {
        const [key, value = ''] = rawParam.split('=');
        if (allowedTelParams.includes(key as keyof TelParams)) {
            params[key as keyof TelParams] = safeDecodeURIComponent(value);
        }
    }

    return {number: safeDecodeURIComponent(rawNumber).trim(), params};
}

// Listens on document in the capture phase so it runs before core's own tel:
// click handler, which would otherwise hand the number to the OS dialer.
export function installTelLinkInterceptor(onDial: (number: string, params: TelParams) => void) {
    const handleClick = (e: MouseEvent) => {
        const link = (e.target as Element | null)?.closest?.('a[href^="tel:"]');
        if (!link) {
            return;
        }

        const {number, params} = parseTelHref(link.getAttribute('href') ?? '');
        if (!number) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        onDial(number, params);
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
}

// The Desktop app joins calls from a separate widget window that creates its
// own session, so it can't use the session /phone-call returns.
function joinsInDesktopWidget() {
    return Boolean(window.desktopAPI?.joinCall) || shouldRenderDesktopWidget();
}

export function telLinkInterceptionSupported() {
    return !joinsInDesktopWidget() && !isCallsPopOut() && !isMobileBrowser();
}

export async function dialPhoneNumber(
    store: Store,
    number: string,
    connect: (channelID: string, session: PhoneCallResponse) => void,
) {
    const state = store.getState();
    const showError = (message: MessageDescriptor) => store.dispatch(displayGenericErrorModal(dialErrorTitle, message));

    if (!sipOutboundEnabled(state)) {
        showError(outboundUnavailableMessage);
        return;
    }

    if (!defaultEnabled(state) && !isCurrentUserSystemAdmin(state)) {
        store.dispatch(displayCallsTestModeUser());
        return;
    }

    if (channelIDForCurrentCall(state)) {
        showError(defineMessage({defaultMessage: 'You\'re already in a call. Leave it before placing a phone call.'}));
        return;
    }

    if (joinsInDesktopWidget()) {
        showError(defineMessage({defaultMessage: 'Phone calls aren\'t supported in the desktop app yet.'}));
        return;
    }

    if (clientConnecting(state)) {
        return;
    }

    store.dispatch(setClientConnecting(true));

    let session: PhoneCallResponse;
    try {
        session = await placePhoneCall(number);
    } catch (err) {
        logErr('failed to place phone call', err);
        store.dispatch(setClientConnecting(false));
        showError(phoneCallErrorMessage(err));
        return;
    }

    await store.dispatch(getChannelAction(session.channel_id));
    connect(session.channel_id, session);
}
