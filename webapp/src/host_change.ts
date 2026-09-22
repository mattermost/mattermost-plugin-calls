// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId, getUser} from 'mattermost-redux/selectors/entities/users';
import {generateId} from 'mattermost-redux/utils/helpers';
import {CALL_HOST, HOST_CONTROL_NOTICE, HOST_CONTROL_NOTICE_TIMEOUT_EVENT} from 'src/action_types';
import {HOST_CONTROL_NOTICE_TIMEOUT} from 'src/constants';
import {channelHasCall, profilesInCurrentCallMap} from 'src/selectors';
import {Store} from 'src/types/mattermost-webapp';
import {HostControlNotice, HostControlNoticeType} from 'src/types/types';
import {getUserDisplayName, isDMChannel} from 'src/utils';

export function applyCallHostChanged(store: Store, channelID: string, hostID: string, callID: string) {
    store.dispatch({
        type: CALL_HOST,
        data: {
            channelID,
            hostID,
            hostChangeAt: Date.now(),
        },
    });

    // A DM caller is made host the moment they place the call, which says nothing they don't
    // already know — the widget is showing them "Calling…". The server sends this before
    // call_start, so having no call in the store yet is what identifies us as the initiator.
    if (
        hostID === getCurrentUserId(store.getState()) &&
        isDMChannel(getChannel(store.getState(), channelID)) &&
        !channelHasCall(store.getState(), channelID)
    ) {
        return;
    }

    const hostProfile = profilesInCurrentCallMap(store.getState())[hostID] ||
        getUser(store.getState(), hostID);
    if (!hostProfile) {
        return;
    }
    const displayName = getUserDisplayName(hostProfile);

    const hostNotice: HostControlNotice = {
        type: HostControlNoticeType.HostChanged,
        callID,
        noticeID: generateId(),
        displayName,
        userID: hostID,
    };

    store.dispatch({
        type: HOST_CONTROL_NOTICE,
        data: hostNotice,
    });

    setTimeout(() => {
        store.dispatch({
            type: HOST_CONTROL_NOTICE_TIMEOUT_EVENT,
            data: {
                callID,
                noticeID: hostNotice.noticeID,
            },
        });
    }, HOST_CONTROL_NOTICE_TIMEOUT);
}
