// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Post} from '@mattermost/types/posts';
import {GlobalState} from '@mattermost/types/store';
import Preferences from 'mattermost-redux/constants/preferences';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/common';
import {get, getBool} from 'mattermost-redux/selectors/entities/preferences';
import {connect} from 'react-redux';
import PostType from 'src/components/custom_post_types/post_type/component';
import {MESSAGE_DISPLAY, MESSAGE_DISPLAY_COMPACT, MESSAGE_DISPLAY_DEFAULT} from 'src/constants';
import {
    channelIDForCurrentCall,
    hostIDForCallInChannel,
    isCloudProfessionalOrEnterpriseorEnterpriseAdvanceOrTrial,
    maxParticipants,
    numSessionsInCallInChannel,
    profilesInCallInChannel,
} from 'src/selectors';

interface OwnProps {
    post: Post,
    isRHS: boolean,
}

const mapStateToProps = (state: GlobalState, ownProps: OwnProps) => {
    return {
        ...ownProps,
        connectedID: channelIDForCurrentCall(state) || '',
        profiles: profilesInCallInChannel(state, ownProps.post.channel_id),

        // The card's ringing state is derived from how many people are in the call, which has to
        // come from the sessions rather than from profiles: profilesInCallInChannel drops anyone
        // whose profile hasn't been fetched yet, which would read as a call nobody has answered.
        numSessions: numSessionsInCallInChannel(state, ownProps.post.channel_id),
        isCloudPaid: isCloudProfessionalOrEnterpriseorEnterpriseAdvanceOrTrial(state),
        maxParticipants: maxParticipants(state),
        militaryTime: getBool(state, Preferences.CATEGORY_DISPLAY_SETTINGS, Preferences.USE_MILITARY_TIME, false),
        compactDisplay: get(state, Preferences.CATEGORY_DISPLAY_SETTINGS, MESSAGE_DISPLAY, MESSAGE_DISPLAY_DEFAULT) === MESSAGE_DISPLAY_COMPACT,
        isHost: hostIDForCallInChannel(state, ownProps.post.channel_id) === getCurrentUserId(state),

        // The call-start post is authored by whoever placed the call, which is what tells the
        // caller's card apart from the callee's. A DM only ever has those two viewers.
        isCaller: ownProps.post.user_id === getCurrentUserId(state),
    };
};

export default connect(mapStateToProps)(PostType);
