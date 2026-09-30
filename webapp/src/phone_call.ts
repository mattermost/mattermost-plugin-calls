// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ClientError} from '@mattermost/client';
import {DisconnectReason} from 'livekit-client';
import {getChannel as getChannelAction} from 'mattermost-redux/actions/channels';
import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {defineMessage, MessageDescriptor} from 'react-intl';
import {
    displayCallsTestModeUser,
    displayGenericErrorModal,
    getCallsConfig,
    hostEndCallForEveryone,
    setClientConnecting,
} from 'src/actions';
import type CallClient from 'src/clients/call/call_client';
import {CALL_EVENT} from 'src/clients/call/constants';
import type {LiveKitSessionResponse} from 'src/clients/call/types';
import RestClient from 'src/clients/rest';
import {logErr} from 'src/log';
import {channelIDForCurrentCall, clientConnecting, defaultEnabled, sipOutboundEnabled} from 'src/selectors';
import type {Store} from 'src/types/mattermost-webapp';
import {getPluginPath, isCallsPopOut, isMobile, shouldRenderDesktopWidget} from 'src/utils';

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

type ConnectPhoneCall = (channelID: string, session: PhoneCallResponse) => void;

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

// LiveKit adds the phone leg to the room before /phone-call returns; the grace
// period only covers a late room update.
const PHONE_LEG_GRACE_MS = 5_000;

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
export function installTelLinkInterceptor(onDial: (number: string, params: TelParams, href: string) => void) {
    const handleClick = (e: MouseEvent) => {
        const link = (e.target as Element | null)?.closest?.('a[href^="tel:"]');
        if (!link) {
            return;
        }

        const href = link.getAttribute('href') ?? '';
        const {number, params} = parseTelHref(href);
        if (!number) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        onDial(number, params, href);
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
}

// Opens the link the way core would have: in a new tab, which hands it to the OS dialer.
export function openInOSDialer(href: string) {
    window.open(href, '_blank', 'noreferrer');
}

// The Desktop app joins calls from a separate widget window that creates its
// own session, so it can't use the session /phone-call returns.
function joinsInDesktopWidget() {
    return Boolean(window.desktopAPI?.joinCall) || shouldRenderDesktopWidget();
}

export function telLinkInterceptionSupported() {
    return !joinsInDesktopWidget() && !isCallsPopOut() && !isMobile();
}

// onOutboundUnavailable replaces the error shown when outbound dialing turns out
// to be off, so a tel: click can fall back to the OS dialer.
export async function dialPhoneNumber(
    store: Store,
    number: string,
    connect: ConnectPhoneCall,
    onOutboundUnavailable?: () => void,
) {
    const state = store.getState();
    const showError = (message: MessageDescriptor) => store.dispatch(displayGenericErrorModal(dialErrorTitle, message));
    const handleOutboundUnavailable = () => {
        if (onOutboundUnavailable) {
            onOutboundUnavailable();
        } else {
            showError(outboundUnavailableMessage);
        }
    };

    if (!sipOutboundEnabled(state)) {
        handleOutboundUnavailable();
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

        // The config is only fetched on load, so an admin may have turned dialing off since.
        // A missing trunk always shows the error, even for tel: links, so admins notice it.
        if ((err as Partial<ClientError> | undefined)?.server_error_id === 'outbound_disabled') {
            store.dispatch(getCallsConfig());
            handleOutboundUnavailable();
            return;
        }

        showError(phoneCallErrorMessage(err));
        return;
    }

    await store.dispatch(getChannelAction(session.channel_id));
    connect(session.channel_id, session);
}

// Keeps tel: links dialing through the plugin while outbound dialing is enabled.
// A click that finds dialing has since been turned off falls back to the OS
// dialer. Returns a cleanup function.
export function registerTelLinkDialing(store: Store, connect: ConnectPhoneCall) {
    const supported = telLinkInterceptionSupported();
    const dialTelLink = (number: string, _params: TelParams, href: string) => dialPhoneNumber(store, number, connect, () => openInOSDialer(href));

    let uninstall: (() => void) | undefined;
    const unsubscribe = store.subscribe(() => {
        const enabled = supported && sipOutboundEnabled(store.getState());
        if (enabled && !uninstall) {
            uninstall = installTelLinkInterceptor(dialTelLink);
        } else if (!enabled && uninstall) {
            uninstall();
            uninstall = undefined;
        }
    });

    return () => {
        unsubscribe();
        uninstall?.();
    };
}

// Ends the phone call once the caller's client leaves it, never joins it, or the
// phone leg is gone. The server otherwise learns of these only from LiveKit
// webhooks, which not every deployment receives, so the phone could keep ringing
// and a redial would be refused as already in progress.
export function watchPhoneCall(store: Store, client: CallClient, channelID: string, connecting: Promise<void>) {
    let ended = false;
    let phoneLegTimer: ReturnType<typeof setTimeout> | undefined;

    const endPhoneCall = () => {
        clearTimeout(phoneLegTimer);
        if (ended) {
            return;
        }
        ended = true;
        hostEndCallForEveryone(channelID).catch((err) => logErr('failed to end phone call', err));
    };

    // connect resolves without joining when the caller cancels mid-connect.
    connecting.then(() => {
        if (!client.isConnected) {
            endPhoneCall();
        }
    }, endPhoneCall);

    // A dial the carrier rejects straight away can leave the room before we join it.
    client.on(CALL_EVENT.CONNECTED, () => {
        // TODO: Move this temporary fix to server-side MM-71035
        phoneLegTimer = setTimeout(() => {
            if (!client.hasSIPParticipant()) {
                store.dispatch(displayGenericErrorModal(dialErrorTitle, dialFailedMessage));
                client.disconnect();
            }
        }, PHONE_LEG_GRACE_MS);
    });

    client.on(CALL_EVENT.USER_LEFT, () => {
        if (!client.hasSIPParticipant()) {
            client.disconnect();
        }
    });

    // Ending the call deletes the room, which hangs up the phone, so don't wait
    // for the LiveKit leave to finish first.
    client.on(CALL_EVENT.DISCONNECTING, endPhoneCall);

    client.on(CALL_EVENT.DISCONNECTED, (reason?: DisconnectReason) => {
        clearTimeout(phoneLegTimer);

        // A deleted room means the server has already ended the call.
        if (reason !== DisconnectReason.ROOM_DELETED) {
            endPhoneCall();
        }
    });
}
