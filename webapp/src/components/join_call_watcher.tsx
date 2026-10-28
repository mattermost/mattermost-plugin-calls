// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {GlobalState} from '@mattermost/types/store';
import {getChannel, getChannelsNameMapInCurrentTeam} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeam} from 'mattermost-redux/selectors/entities/teams';
import {useEffect} from 'react';
import {useSelector} from 'react-redux';
import {useLocation} from 'react-router-dom';

type Props = {
    onJoinCall: (channelId: string) => void;
};

// Watches for the ?join_call=true query parameter and triggers a join when it
// appears. Handles cross-channel link clicks and pasted URLs: the parameter
// is briefly visible at React Router's level before Mattermost canonicalizes
// the URL away, which is enough for an effect to observe it.
//
// Same-channel clicks are NOT handled here because the URL never updates in
// that case — see the click handler in index.tsx.
const JoinCallWatcher = ({onJoinCall}: Props) => {
    const location = useLocation();
    const joinCall = new URLSearchParams(location.search).get('join_call');

    // Resolve the URL's channel in a single selector so the effect only
    // re-fires when the resolved channel itself changes, not whenever
    // unrelated channel map updates replace the broader Redux objects.
    const channelFromUrl = useSelector((state: GlobalState): Channel | null => {
        // Pathname is /TEAM/channels/<channelID-or-name>. During cross-channel
        // navigation it's the ID form briefly before Mattermost canonicalizes
        // to the name form. We accept either.
        //
        // The team segment must match the current team to avoid mis-resolving
        // a cross-team link against the current team's channel map.
        // DM/GM URLs (/messages/...) are not handled — see feature doc.
        const match = location.pathname.match(/^\/([^/]+)\/channels\/([^/]+)/);
        if (!match) {
            return null;
        }
        const [, teamName, idOrName] = match;
        const currentTeamName = getCurrentTeam(state)?.name;
        if (!currentTeamName || teamName !== currentTeamName) {
            return null;
        }
        return getChannel(state, idOrName) || getChannelsNameMapInCurrentTeam(state)[idOrName] || null;
    });

    useEffect(() => {
        if (joinCall !== 'true' || !channelFromUrl) {
            return;
        }
        onJoinCall(channelFromUrl.id);
    }, [joinCall, channelFromUrl, onJoinCall]);

    return null;
};

export default JoinCallWatcher;
