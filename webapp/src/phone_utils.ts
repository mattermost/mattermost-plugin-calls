// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    CALL_TYPE_PHONE,
    CallsPostProps,
    PhoneCallFields,
    PhoneCallProps,
    PhoneSessionState,
    SIP_CALL_STATUSES,
    SIPCallStatus,
} from 'src/types/types';

export function getPhoneCallProps(fields: PhoneCallFields | undefined): PhoneCallProps | undefined {
    if (fields?.type !== CALL_TYPE_PHONE) {
        return undefined;
    }

    return {
        number: fields.phone_number ?? '',
        displayNumber: fields.display_number ?? '',
        label: fields.display_label ?? '',
        targetUserID: fields.target_user_id ?? '',
    };
}

export function getPhoneCallPropsFromPostProps(props: Partial<CallsPostProps> | undefined): PhoneCallProps | undefined {
    if (!props) {
        return undefined;
    }

    return getPhoneCallProps({
        type: props.call_type,
        phone_number: props.phone_number,
        display_number: props.display_number,
        display_label: props.display_label,
        target_user_id: props.target_user_id,
    });
}

export function toSIPCallStatus(value: string | undefined): SIPCallStatus | undefined {
    return SIP_CALL_STATUSES.find((status) => status === value);
}

export function isSIPSession(session: Pick<PhoneSessionState, 'is_sip_participant'> | undefined): boolean {
    return Boolean(session?.is_sip_participant);
}

// The phone leg is a call session server-side but not a participant in the
// UI: its user_id is the SIP identity, not a Mattermost user.
export function withoutSIPSessions<T extends Pick<PhoneSessionState, 'is_sip_participant'>>(sessions: T[]): T[] {
    return sessions.filter((session) => !isSIPSession(session));
}

export function phoneNumberForDisplay(props: Pick<PhoneCallProps, 'number' | 'displayNumber'> | undefined): string {
    return props?.displayNumber || props?.number || '';
}
