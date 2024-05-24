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

const CallParticipantRHS = ({session, profile, isYou, isHost, iAmHost, isSharingScreen, onRemove, callID}: Props) => {
    const {formatMessage} = useIntl();
    const {hoverOn, hoverOff, onOpenChange, showHostControls} = useHostControls(isYou, isHost, iAmHost);

    const isMuted = !session.unmuted;
    const isSpeaking = Boolean(session.voice);
    const isHandRaised = Boolean(session.raised_hand > 0);
    let youStyle: CSSProperties = {color: 'rgba(var(--center-channel-color-rgb), 0.56)'};
    if (isYou && isHost) {
        youStyle = {...youStyle, marginLeft: '2px'};
    }

    if (!profile) {
        return null;
    }

    const MuteIcon = isMuted ? MutedIcon : UnmutedIcon;

    return (
        <ParticipantListItem
            onMouseEnter={hoverOn}
            onMouseLeave={hoverOff}
            $hover={showHostControls}
        >

            <Avatar
                size={24}
                fontSize={10}
                border={false}
                borderGlowWidth={isSpeaking ? 2 : 0}
                url={Client4.getProfilePictureUrl(profile.id, profile.last_picture_update)}
            />

            <span
                style={{
                    display: 'block',
                    whiteSpace: 'pre',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontWeight: 600,
                    fontSize: '14px',
                    lineHeight: '20px',
                }}
            >
                {getUserDisplayName(profile)}
            </span>

            {(isYou || isHost) &&
                <span style={{marginLeft: -4, display: 'flex', alignItems: 'baseline', gap: 5}}>
                    {isYou &&
                        <span style={youStyle}>
                            {formatMessage({defaultMessage: '(you)'})}
                        </span>
                    }
                    {isHost &&
                        <HostBadge onWhiteBg={true}/>
                    }
                </span>
            }

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginLeft: 'auto',
                    gap: '12px',
                }}
            >
                {session?.reaction &&
                    <div
                        style={{
                            marginBottom: 4,
                            marginRight: 2,
                        }}
                    >
                        <Emoji
                            emoji={session.reaction.emoji}
                            size={16}
                        />
                    </div>
                }
                {isHandRaised &&
                    <HandEmoji
                        style={{
                            fill: 'var(--away-indicator)',
                            width: '16px',
                            height: '16px',
                        }}
                    />
                }

                {isSharingScreen &&
                    <ScreenIcon
                        fill={'rgb(var(--dnd-indicator-rgb))'}
                        style={{width: '16px', height: '16px'}}
                    />
                }

                {showHostControls &&
                    <StyledDotMenu
                        icon={<StyledThreeDotsButton/>}
                        dotMenuButton={StyledDotMenuButton}
                        dropdownMenu={StyledDropdownMenu}
                        title={formatMessage({defaultMessage: 'Host controls'})}
                        placement='bottom-end'
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
                    fill={isMuted ? '#C4C4C4' : '#3DB887'}
                    style={{width: '16px', height: '16px'}}
                />

            </div>
        </ParticipantListItem>
    );
};

const ParticipantListItem = styled.li<{ $hover: boolean }>`
    display: flex;
    align-items: center;
    padding: 6px 16px;
    gap: 8px;
    height: 40px;

    ${({$hover}) => $hover && css`
        background: rgba(var(--center-channel-color-rgb), 0.08);
    `}
`;

const StyledDotMenu = styled(DotMenu)`
    margin-right: -4px;
`;

const StyledThreeDotsButton = styled(ThreeDotsButton)`
    fill: rgba(var(--center-channel-color-rgb), 0.56);
`;

const StyledDotMenuButton = styled(DotMenuButton)<{ $isActive: boolean }>`
    > svg {
        fill: ${(props) => (props.$isActive ? 'var(--button-bg)' : 'rgba(var(--center-channel-color-rgb), 0.56)')};
    }
`;

export default CallParticipantRHS;
