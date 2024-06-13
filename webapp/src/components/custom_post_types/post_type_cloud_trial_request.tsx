// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {Post} from '@mattermost/types/posts';
import {GlobalState} from '@mattermost/types/store';
import {Team} from '@mattermost/types/teams';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getTeam} from 'mattermost-redux/selectors/entities/teams';
import React from 'react';
import {FormattedMessage} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {displayCloudPricing} from 'src/actions';
import {PrimaryButton, TertiaryButton} from 'src/components/buttons';
import {
    CustomPostButtonRow,
    CustomPostContainer,
    CustomPostContent,
    CustomPostHeader,
} from 'src/components/custom_post_types/custom_post_styles';
import PostText from 'src/components/custom_post_types/post_text';
import UpgradeIllustrationSvg from 'src/components/custom_post_types/upgrade_illustration_svg';
import {isCloud} from 'src/selectors';
import styled from 'styled-components';

interface Props {
    post: Post;
}

export const PostTypeCloudTrialRequest = ({post}: Props) => {
    const dispatch = useDispatch();
    const isCloudLicense = useSelector(isCloud);
    const attachments = post.props.attachments[0];

    const channel = useSelector<GlobalState, Channel|undefined>((state) => getChannel(state, post.channel_id));
    const team = useSelector<GlobalState, Team|undefined>((state) => getTeam(state, channel?.team_id || ''));

    // Shouldn't happen, but just in case:
    if (!isCloudLicense) {
        return null;
    }

    // Remove the footer (which starts with the Upgrade now link),
    // and the separator, both used as fallback for mobile
    const text = attachments.text.split('[Upgrade now]')[0].replace(/---/g, '');

    return (
        <>
            <StyledPostText
                text={post.message}
                team={team}
            />
            <CustomPostContainer>
                <CustomPostContent>
                    <CustomPostHeader>
                        {attachments.title}
                    </CustomPostHeader>
                    <TextBody>
                        {text}
                    </TextBody>
                    <CustomPostButtonRow>
                        <PrimaryButton onClick={() => dispatch(displayCloudPricing())}>
                            <FormattedMessage defaultMessage='Upgrade now'/>
                        </PrimaryButton>
                        <StyledTertiaryButton
                            onClick={() => window.open('https://mattermost.com/pricing-cloud')}
                        >
                            <FormattedMessage defaultMessage='Learn more'/>
                        </StyledTertiaryButton>
                    </CustomPostButtonRow>
                </CustomPostContent>
                <Image/>
            </CustomPostContainer>
        </>
    );
};

const Image = styled(UpgradeIllustrationSvg)`
    width: 175px;
    height: 106px;
    margin: 16px;
`;

const TextBody = styled.div`
    width: 396px;
    margin-top: 4px;
    margin-bottom: 4px;
`;

const StyledPostText = styled(PostText)`
    margin-bottom: 8px;
`;

const StyledTertiaryButton = styled(TertiaryButton)`
    margin-left: 10px;
`;
