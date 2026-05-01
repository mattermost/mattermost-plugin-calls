// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {getChannelsNameMapInCurrentTeam} from 'mattermost-redux/selectors/entities/channels';
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
    const channelsById = useSelector((state: GlobalState) => state.entities.channels.channels);
    const channelsByName = useSelector(getChannelsNameMapInCurrentTeam);
    const currentTeamName = useSelector(getCurrentTeam)?.name;

    useEffect(() => {
        if (joinCall !== 'true') {
            return;
        }

        // Pathname is /TEAM/channels/<channelID-or-name>. During cross-channel
        // navigation, it's the channel ID briefly before Mattermost canonicalizes
        // it to the channel name. We accept either by looking up both maps.
        // Resolving via Redux directly (rather than gating on currentChannelId)
        // is essential — currentChannelId lags the URL during cross-channel nav,
        // and canonicalization strips the param before Redux catches up.
        //
        // The team segment must match the current team. channelsByName is
        // scoped to the current team, so a cross-team link like
        // /other-team/channels/town-square would otherwise mis-resolve to the
        // current team's town-square. DM/GM URLs (/messages/...) are not
        // handled — see open work in feature doc.
        const match = location.pathname.match(/^\/([^/]+)\/channels\/([^/]+)/);
        if (!match) {
            return;
        }
        const [, teamName, idOrName] = match;
        if (!currentTeamName || teamName !== currentTeamName) {
            return;
        }

        const channel = channelsById[idOrName] || channelsByName[idOrName];
        if (!channel) {
            return;
        }

        onJoinCall(channel.id);
    }, [joinCall, location.pathname, channelsById, channelsByName, currentTeamName, onJoinCall]);

    return null;
};

export default JoinCallWatcher;
