// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserProfile} from '@mattermost/types/users';
import {Reducer} from 'redux';
import {CALL_ENDED, UN_INITIALIZED} from 'src/state/common_action_types';

import {SIP_CALL_DETAILS} from './action_types';
import {Actions} from './actions';

// PHONE_CALL_TYPE is the wire value of `call.props.type` that marks a call as a
// SIP/phone call. It is the only signal the server sends to discriminate phone
// calls from regular WebRTC calls; the client stores presence, not the value.
export const PHONE_CALL_TYPE = 'phone';

// CallDirection distinguishes inbound from outbound SIP/phone calls. Today only
// outbound calls are placed; the inbound value is reserved for incoming-SIP
// support and is read from the wire defensively (see getSipCallDetailsFromCallState).
export enum CallDirection {
    Outbound = 'outbound',
    Inbound = 'inbound',
}

// SipCallDetails holds the contact metadata for a SIP/phone call, derived from the
// server's `call.props`. The presence of an entry in this slice IS the
// "is this a phone/SIP call" signal — there is no separate `type` flag. Kept
// plugin-local: the calls-common CallState type does not declare these props
// yet (server proposal P1), so they are read defensively from the wire.
export type SipCallDetails = {
    direction: CallDirection;
    phone_number: string;
    display_number: string;
    label: string;
    user_id: UserProfile['id'];
}

// State is keyed by channelID and only holds entries for SIP/phone calls.
// Regular WebRTC calls have no entry here, mirroring how hosts/screenSharingIDs
// only hold entries for the channels they apply to.
type State = {
    [channelID: string]: SipCallDetails;
}

const emptyState: State = {};

export const reducer: Reducer<State, Actions> = (initialState = emptyState, action): State => {
    switch (action.type) {
    case UN_INITIALIZED: {
        return emptyState;
    }

    case SIP_CALL_DETAILS: {
        return {
            ...initialState,
            [action.data.channelID]: action.data.details,
        };
    }

    case CALL_ENDED: {
        const nextState = {...initialState};
        delete nextState[action.data.channelID];
        return nextState;
    }

    default:
        return initialState;
    }
};
