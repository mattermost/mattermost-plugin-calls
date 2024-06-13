// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {Team} from '@mattermost/types/teams';
import {getChannelsNameMapInCurrentTeam} from 'mattermost-redux/selectors/entities/channels';
import React, {ReactNode, ReactNodeArray} from 'react';
import {useSelector} from 'react-redux';
import {ChannelNamesMap} from 'src/components/custom_post_types/types';
import styled from 'styled-components';

interface Props {
    text: string;
    team?: Team;
    children?: ReactNode | ReactNodeArray;
    className?: string;
}

const PostText = (props: Props) => {
    const channelNamesMap = useSelector<GlobalState, ChannelNamesMap>(getChannelsNameMapInCurrentTeam);

    // @ts-ignore
    const {formatText, messageHtmlToComponent} = window.PostUtils;

    const markdownOptions = {
        singleline: false,
        mentionHighlight: true,
        atMentions: true,
        team: props.team,
        channelNamesMap,
    };

    return (
        <UpdateBody className={props.className}>
            {messageHtmlToComponent(formatText(props.text, markdownOptions), true, {})}
            {props.children}
        </UpdateBody>
    );
};

export const UpdateBody = styled.div`
    padding-right: 6px;
`;

export default PostText;
