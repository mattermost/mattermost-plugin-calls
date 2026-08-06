// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {getUser} from 'mattermost-redux/selectors/entities/users';
import {useEffect} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {loadProfilesByIdsIfMissing} from 'src/actions';
import {dmCalleeAnsweredAtForCurrentCall, isCurrentDMCallInCallingState, otherUserIDForCurrentDMCall} from 'src/selectors';

interface DMCallingState {
    isDMCalling: boolean;
    dmCalleeID?: string;
    dmCallee?: UserProfile;
    dmCalleeAnsweredAt?: number;
}

/** Reports whether the current DM call is still ringing (caller joined, callee has not answered)
 * The callee's profile comes from the DM channel, not call sessions, because the callee has not joined yet.
 */
export function useDMCallingState(): DMCallingState {
    const dispatch = useDispatch();
    const isInCallingStateForDMChannelCall = useSelector(isCurrentDMCallInCallingState);
    const otherDMUserID = useSelector(otherUserIDForCurrentDMCall);
    const otherDMUser = useSelector((state: GlobalState) => getUser(state, otherDMUserID));
    const dmCalleeAnsweredAt = useSelector(dmCalleeAnsweredAtForCurrentCall);

    useEffect(() => {
        if (isInCallingStateForDMChannelCall && otherDMUserID) {
            dispatch(loadProfilesByIdsIfMissing([otherDMUserID]));
        }
    }, [dispatch, isInCallingStateForDMChannelCall, otherDMUserID]);

    if (isInCallingStateForDMChannelCall) {
        if (otherDMUserID) {
            return {isDMCalling: true, dmCalleeID: otherDMUserID, dmCallee: otherDMUser, dmCalleeAnsweredAt: undefined};
        }
        return {isDMCalling: false, dmCalleeID: undefined, dmCallee: undefined, dmCalleeAnsweredAt: undefined};
    } else if (dmCalleeAnsweredAt && dmCalleeAnsweredAt > 0) {
        return {isDMCalling: false, dmCalleeID: otherDMUserID, dmCallee: otherDMUser, dmCalleeAnsweredAt};
    }

    return {isDMCalling: false, dmCalleeID: undefined, dmCallee: undefined, dmCalleeAnsweredAt: undefined};
}
