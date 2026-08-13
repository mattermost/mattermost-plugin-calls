// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {getUser} from 'mattermost-redux/selectors/entities/users';
import {useEffect} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {loadProfilesByIdsIfMissing} from 'src/actions';
import {channelForCurrentCall, dmCalleeAnsweredAtForCurrentCall, isCurrentDMCallInCallingState, otherUserIDForCurrentDMCall} from 'src/selectors';
import {isDMChannel} from 'src/utils';

interface DMCallingState {
    isDM: boolean;
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
    const isDM = useSelector((state: GlobalState) => isDMChannel(channelForCurrentCall(state)));
    const isDMCalling = useSelector(isCurrentDMCallInCallingState);
    const otherUserID = useSelector(otherUserIDForCurrentDMCall);
    const otherUser = useSelector((state: GlobalState) => getUser(state, otherUserID));
    const answeredAt = useSelector(dmCalleeAnsweredAtForCurrentCall);

    useEffect(() => {
        if (isDM && otherUserID) {
            dispatch(loadProfilesByIdsIfMissing([otherUserID]));
        }
    }, [dispatch, isDM, otherUserID]);

    return {
        isDM,
        isDMCalling: isDMCalling && Boolean(otherUserID),
        dmCalleeID: isDM && otherUserID ? otherUserID : undefined,
        dmCallee: isDM && otherUserID ? otherUser : undefined,
        dmCalleeAnsweredAt: isDM && answeredAt > 0 ? answeredAt : undefined,
    };
}
