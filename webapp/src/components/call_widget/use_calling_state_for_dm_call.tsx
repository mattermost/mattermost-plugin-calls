// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {getUser} from 'mattermost-redux/selectors/entities/users';
import {useSelector} from 'react-redux';
import {isCurrentDMCallInCallingState, otherUserIDForCurrentDMCall} from 'src/selectors';

type DMCallingState =
{isDMCalling: true; dmCallee: UserProfile} |
{isDMCalling: false; dmCallee: undefined};

/** Reports whether the current DM call is still ringing (caller joined, callee has not answered)
 * The callee's profile comes from the DM channel, not call sessions, because the callee has not joined yet.
 */
export function useDMCallingState(): DMCallingState {
    const isInCallingStateForDMChannelCall = useSelector(isCurrentDMCallInCallingState);
    const otherDMUserID = useSelector(otherUserIDForCurrentDMCall);
    const otherDMUser = useSelector((state: GlobalState) => getUser(state, otherDMUserID || ''));

    if (isInCallingStateForDMChannelCall) {
        return {isDMCalling: true, dmCallee: otherDMUser};
    }

    return {isDMCalling: false, dmCallee: undefined};
}
