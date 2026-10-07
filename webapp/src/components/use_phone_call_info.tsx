// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {getUser} from 'mattermost-redux/selectors/entities/users';
import {useEffect} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {loadProfilesByIdsIfMissing} from 'src/actions';
import {phoneNumberForDisplay} from 'src/phone_utils';
import {phoneCallPropsForCurrentCall, sipCallStateForCurrentCall} from 'src/selectors';
import {PhoneCallProps} from 'src/types/types';
import {getUserDisplayName} from 'src/utils';

export const PHONE_CALL_SUBTITLE_SEPARATOR = ' • ';

export type PhoneCallInfo = {
    isPhoneCall: boolean;
    phone?: PhoneCallProps;
    targetUser?: UserProfile;

    // The phone leg has not been answered yet.
    isRinging: boolean;
    answeredAt: number;

    // Who is being called: the target user's name, else the number.
    name: string;

    // Header text: "Calling {name}…" while ringing, then the name.
    title: string;

    // "number • label" as shown under the title while ringing.
    subtitle: string;
}

const NOT_A_PHONE_CALL: PhoneCallInfo = {
    isPhoneCall: false,
    isRinging: false,
    answeredAt: 0,
    name: '',
    title: '',
    subtitle: '',
};

export function usePhoneCallInfo(): PhoneCallInfo {
    const dispatch = useDispatch();
    const {formatMessage} = useIntl();
    const phone = useSelector(phoneCallPropsForCurrentCall);
    const sipState = useSelector(sipCallStateForCurrentCall);
    const targetUserID = phone?.targetUserID ?? '';
    const targetUser = useSelector((state: GlobalState) => (targetUserID ? getUser(state, targetUserID) : undefined));

    useEffect(() => {
        if (targetUserID) {
            dispatch(loadProfilesByIdsIfMissing([targetUserID]));
        }
    }, [dispatch, targetUserID]);

    if (!phone) {
        return NOT_A_PHONE_CALL;
    }

    const number = phoneNumberForDisplay(phone);
    const name = (targetUser && getUserDisplayName(targetUser)) || number;
    const answeredAt = sipState?.answeredAt ?? 0;
    const isRinging = !answeredAt;

    return {
        isPhoneCall: true,
        phone,
        targetUser: targetUser ?? undefined,
        isRinging,
        answeredAt,
        name,
        title: isRinging ? formatMessage({defaultMessage: 'Calling {name}…'}, {name}) : name,
        subtitle: [number, phone.label].filter(Boolean).join(PHONE_CALL_SUBTITLE_SEPARATOR),
    };
}
