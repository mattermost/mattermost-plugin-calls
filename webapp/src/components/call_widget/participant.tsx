import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {UserProfile} from '@mattermost/types/users';
import {Client4} from 'mattermost-redux/client';
import React, {CSSProperties} from 'react';
import {useIntl} from 'react-intl';
import Avatar from 'src/components/avatar/avatar';
import {HostBadge} from 'src/components/badge';
import DotMenu, {DotMenuButton} from 'src/components/dot_menu/dot_menu';
import {Emoji} from 'src/components/emoji/emoji';
import {useHostControls} from 'src/components/expanded_view/hooks';
import {StyledDropdownMenu} from 'src/components/expanded_view/styled_components';
import {HostControlsMenu} from 'src/components/host_controls_menu';
import HandEmoji from 'src/components/icons/hand';
import MutedIcon from 'src/components/icons/muted_icon';
import ScreenIcon from 'src/components/icons/screen_icon';
import {ThreeDotsButton} from 'src/components/icons/three_dots';
import UnmutedIcon from 'src/components/icons/unmuted_icon';
import {getUserDisplayName} from 'src/utils';
import styled, {css} from 'styled-components';

type Props = {
    session: UserSessionState;
    profile?: UserProfile;
    isYou: boolean;
    isHost: boolean;
    iAmHost: boolean,
    isSharingScreen: boolean;
    onRemove: () => void;
    callID?: string;
};

export const Participant = ({session, profile, isYou, isHost, iAmHost, isSharingScreen, onRemove, callID}: Props) => {
    const {formatMessage} = useIntl();
    const {hoverOn, hoverOff, onOpenChange, showHostControls} = useHostControls(isYou, isHost, iAmHost);

    const isMuted = !session.unmuted;
    const isSpeaking = Boolean(session.voice);
    const isHandRaised = Boolean(session.raised_hand > 0);
    let youStyle: CSSProperties = {color: 'rgba(var(--center-channel-color-rgb), 0.56)'};
    if (isYou && isHost) {
        youStyle = {...youStyle, marginLeft: '2px'};
    }

    const MuteIcon = isMuted ? MutedIcon : UnmutedIcon;

    if (!profile) {
        return null;
    }

    return (
        <ParticipantListItem
            onMouseEnter={hoverOn}
            onMouseLeave={hoverOff}
            className='MenuItem'
            data-testid={isHost && 'participant-list-host'}
            key={'participants_profile_' + session.session_id}
            $hover={showHostControls}
        >
            <Avatar
                size={20}
                fontSize={14}
                url={Client4.getProfilePictureUrl(profile.id, profile.last_picture_update)}
                borderGlowWidth={isSpeaking ? 2 : 0}
            />

            <span
                className='MenuItem__primary-text'
                style={{
                    display: 'block',
                    whiteSpace: 'pre',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    padding: '0',
                    lineHeight: '20px',
                    fontSize: '14px',
                }}
            >
                {getUserDisplayName(profile)}
            </span>

            {(isYou || isHost) &&
                <span style={{marginLeft: -8, display: 'flex', alignItems: 'baseline', gap: 5}}>
                    {isYou &&
                        <span style={youStyle}>
                            {formatMessage({defaultMessage: '(you)'})}
                        </span>
                    }
                    {isHost &&
                        <HostBadge
                            data-testid={'participant-list-host-badge'}
                            onWhiteBg={true}
                        />
                    }
                </span>
            }

            <span
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginLeft: 'auto',
                    gap: '14px',
                }}
            >
                {session?.reaction &&
                    <Emoji
                        emoji={session.reaction.emoji}
                        size={14}
                    />
                }
                {isHandRaised &&
                    <HandEmoji
                        data-testid={'raised-hand'}
                        fill='var(--away-indicator)'
                        style={{width: '14px', height: '14px'}}
                    />
                }

                {isSharingScreen &&
                    <ScreenIcon
                        fill={'rgb(var(--dnd-indicator-rgb))'}
                        style={{width: '14px', height: '14px'}}
                    />
                }

                {showHostControls &&
                    <StyledDotMenu
                        icon={<StyledThreeDotsButton data-testid={'three-dots-button'}/>}
                        dotMenuButton={StyledDotMenuButton}
                        dropdownMenu={StyledDropdownMenu}
                        title={formatMessage({defaultMessage: 'Host controls'})}
                        placement={'top-start'}
                        strategy={'fixed'}
                        onOpenChange={onOpenChange}
                    >
                        <HostControlsMenu
                            callID={callID}
                            userID={session.user_id}
                            sessionID={session.session_id}
                            isMuted={isMuted}
                            isSharingScreen={isSharingScreen}
                            isHandRaised={isHandRaised}
                            isHost={isHost}
                            onRemove={onRemove}
                        />
                    </StyledDotMenu>
                }

                <MuteIcon
                    data-testid={isMuted ? 'muted' : 'unmuted'}
                    fill={isMuted ? 'rgba(var(--center-channel-color-rgb), 0.56)' : '#3DB887'}
                    style={{width: '14px', height: '14px'}}
                />

            </span>
        </ParticipantListItem>
    );
};

const ParticipantListItem = styled.li<{ $hover: boolean }>`
    display: flex;
    align-items: center;
    padding: 6px 16px;
    gap: 12px;
    height: 40px;
    appRegion: 'no-drag';

    ${({$hover}) => $hover && css`
        background: rgba(var(--center-channel-color-rgb), 0.08);
    `}
`;

const StyledDotMenu = styled(DotMenu)`
    margin-right: -4px;
`;

const StyledDotMenuButton = styled(DotMenuButton)<{ $isActive: boolean }>`
    > svg {
        fill: ${(props) => (props.$isActive ? 'var(--button-bg)' : 'rgba(var(--center-channel-color-rgb), 0.56)')};
    }
`;

const StyledThreeDotsButton = styled(ThreeDotsButton)`
    fill: rgba(var(--center-channel-color-rgb), 0.56);
`;
