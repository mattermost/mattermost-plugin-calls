import {Reaction} from '@mattermost/calls-common/lib/types';
import React from 'react';
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
import {ThreeDotsButton} from 'src/components/icons/three_dots';
import UnmutedIcon from 'src/components/icons/unmuted_icon';
import styled, {css, CSSObject} from 'styled-components';

export type Props = {
    name: string,
    pictureURL?: string,
    isMuted: boolean,
    isHandRaised: boolean,
    reaction?: Reaction,
    isSpeaking: boolean,
    isYou: boolean,
    isHost: boolean,
    iAmHost: boolean,
    callID?: string,
    userID: string,
    sessionID: string,
    onRemove: () => void,
    isSharingScreen?: boolean,
}

export default function CallParticipant({
    name,
    pictureURL,
    isMuted,
    isHandRaised,
    reaction,
    isSpeaking,
    isYou,
    isHost,
    iAmHost,
    callID,
    userID,
    sessionID,
    onRemove,
    isSharingScreen = false,
}: Props) {
    const {formatMessage} = useIntl();
    const {hoverOn, hoverOff, onOpenChange, hostControlsAvailable, showHostControls} = useHostControls(isYou, isHost, iAmHost);

    const MuteIcon = isMuted ? MutedIcon : UnmutedIcon;

    if (!pictureURL) {
        return null;
    }

    const innerParticipant = (
        <>
            <div style={{position: 'relative'}}>
                <Avatar
                    size={50}
                    fontSize={18}
                    border={false}
                    borderGlowWidth={isSpeaking ? 3 : 0}
                    url={pictureURL}
                />
                <div
                    style={{
                        position: 'absolute',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        bottom: 0,
                        right: 0,
                        background: isMuted ? 'var(--calls-badge-bg)' : '#3DB887',
                        borderRadius: '30px',
                        width: '20px',
                        height: '20px',
                    }}
                >
                    <MuteIcon
                        data-testid={isMuted ? 'muted' : 'unmuted'}
                        fill='white'
                        style={{width: '14px', height: '14px'}}
                    />
                </div>
                {isHandRaised &&
                    <div style={styles.handRaisedContainer}>
                        <HandEmoji
                            data-testid={'raised-hand'}
                            style={{
                                fill: 'var(--away-indicator)',
                                width: '20px',
                                height: '20px',
                            }}
                        />
                    </div>
                }
                {!isHandRaised && reaction &&
                    <div style={{...styles.reactionContainer, background: 'var(--calls-bg)'}}>
                        <Emoji emoji={reaction.emoji}/>
                    </div>
                }
            </div>

            <span style={{fontWeight: 600, fontSize: '12px', lineHeight: '16px', textAlign: 'center'}}>
                {name}
            </span>

            {isHost && <HostBadge data-testid={'host-badge'}/>}
        </>
    );

    if (hostControlsAvailable) {
        return (
            <Participant
                onMouseEnter={hoverOn}
                onMouseLeave={hoverOff}
                $hover={showHostControls}
            >
                {showHostControls &&
                    <StyledDotMenu
                        icon={<StyledThreeDotsButton data-testid={'three-dots-button'}/>}
                        dotMenuButton={StyledDotMenuButton}
                        dropdownMenu={StyledDropdownMenu}
                        title={formatMessage({defaultMessage: 'Host controls'})}
                        placement={'bottom-start'}
                        strategy={'fixed'}
                        onOpenChange={onOpenChange}
                    >
                        <HostControlsMenu
                            callID={callID}
                            userID={userID}
                            sessionID={sessionID}
                            isMuted={isMuted}
                            isSharingScreen={isSharingScreen}
                            isHandRaised={isHandRaised}
                            isHost={isHost}
                            onRemove={onRemove}
                        />
                    </StyledDotMenu>
                }
                {innerParticipant}
            </Participant>
        );
    }

    return (
        <Participant>
            {innerParticipant}
        </Participant>
    );
}

const styles: Record<string, CSSObject> = {
    reactionContainer: {
        position: 'absolute',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        top: -5,
        right: -10,
        borderRadius: '30px',
        width: '25px',
        height: '25px',
        fontSize: '12px',
    },
    handRaisedContainer: {
        position: 'absolute',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        top: -5,
        right: -10,
        background: 'white',
        color: 'var(--away-indicator)',
        borderRadius: '30px',
        width: '25px',
        height: '25px',
        fontSize: '18px',
    },
};

const Participant = styled.li<{ $hover?: boolean }>`
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    gap: 12px;
    padding: 16px;

    ${({$hover}) => $hover && css`
        border-radius: 8px;
        background: rgba(var(--sidebar-text-rgb), 0.08);
    `}
`;

const StyledThreeDotsButton = styled(ThreeDotsButton)`
    fill: rgba(var(--sidebar-text-rgb), 0.56);
`;

const StyledDotMenuButton = styled(DotMenuButton)`
    background-color: ${(props) => (props.$isActive ? 'rgba(var(--sidebar-text-rgb), 0.16)' : 'transparent')};

    &:hover {
        background-color: ${(props) => (props.$isActive ? 'rgba(var(--sidebar-text-rgb), 0.16)' : 'rgba(var(--sidebar-text-rgb), 0.16)')};
    }
`;

const StyledDotMenu = styled(DotMenu)`
    position: absolute;
    top: 4px;
    right: 4px;
`;
