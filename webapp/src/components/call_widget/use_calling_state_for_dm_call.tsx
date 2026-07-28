// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {getUser} from 'mattermost-redux/selectors/entities/users';
import {useSelector} from 'react-redux';
import {isCurrentDMCallInCallingState, otherUserIDForCurrentDMCall} from 'src/selectors';

export function useCallingStateForDMCall(): {isInCallingStateForDMChannelCall: boolean, otherDMUser: UserProfile | undefined} {
    const isInCallingStateForDMChannelCall = useSelector(isCurrentDMCallInCallingState);
    const otherDMUserID = useSelector(otherUserIDForCurrentDMCall);
    const otherDMUser = useSelector((state: GlobalState) => getUser(state, otherDMUserID || ''));

    if (isInCallingStateForDMChannelCall) {
        return {isInCallingStateForDMChannelCall: true, otherDMUser};
    }

    return {isInCallingStateForDMChannelCall: false, otherDMUser: undefined};
}