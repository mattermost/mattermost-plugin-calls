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
import styled, {css} from 'styled-components';

export enum TileSize {
    Small,
    Medium,
    Large,
    ExtraLarge,
}

export type Props = {
    name: string,
    size: TileSize,
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

const tileSizePropsMap = {
    [TileSize.Small]: {
        avatarSize: 72,
        fontSize: 12,
        lineHeight: 16,
        gap: 8,
        padding: 12,
        iconPadding: 4,
        iconSize: 16,
        dotMenuIconSize: 12,
    },
    [TileSize.Medium]: {
        avatarSize: 96,
        fontSize: 12,
        lineHeight: 16,
        gap: 12,
        padding: 16,
        iconPadding: 6,
        iconSize: 16,
        dotMenuIconSize: 16,
    },
    [TileSize.Large]: {
        avatarSize: 120,
        fontSize: 12,
        lineHeight: 16,
        gap: 12,
        padding: 20,
        iconPadding: 8,
        iconSize: 20,
        dotMenuIconSize: 16,
    },
    [TileSize.ExtraLarge]: {
        avatarSize: 156,
        fontSize: 14,
        lineHeight: 20,
        gap: 12,
        padding: 26,
        iconPadding: 8,
        iconSize: 24,
        dotMenuIconSize: 20,
    },
};

export default function CallParticipant({
    name,
    size,
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
                    size={tileSizePropsMap[size].avatarSize}
                    fontSize={tileSizePropsMap[size].fontSize}
                    border={false}
                    borderGlowWidth={isSpeaking ? 3 : 0}
                    url={pictureURL}
                />

                <MuteIconWrapper
                    $isMuted={isMuted}
                    $padding={tileSizePropsMap[size].iconPadding}
                    $size={tileSizePropsMap[size].iconSize}
                >
                    <MuteIcon
                        data-testid={isMuted ? 'muted' : 'unmuted'}
                    />
                </MuteIconWrapper>

                {isHandRaised &&
                    <ReactionWrapper
                        $isHandRaised={isHandRaised}
                        $padding={tileSizePropsMap[size].iconPadding}
                        $size={tileSizePropsMap[size].iconSize}
                    >
                        <HandEmoji
                            data-testid={'raised-hand'}
                        />
                    </ReactionWrapper>
                }
                {!isHandRaised && reaction &&
                    <ReactionWrapper
                        $isHandRaised={isHandRaised}
                        $padding={tileSizePropsMap[size].iconPadding}
                        $size={tileSizePropsMap[size].iconSize}
                    >
                        <Emoji
                            emoji={reaction.emoji}
                            size={tileSizePropsMap[size].iconSize}
                        />
                    </ReactionWrapper>
                }
            </div>

            <StyledName
                $fontSize={tileSizePropsMap[size].fontSize}
                $lineHeight={tileSizePropsMap[size].lineHeight}
            >
                {name}
            </StyledName>

            {isHost && <HostBadge data-testid={'host-badge'}/>}
        </>
    );

    if (hostControlsAvailable) {
        return (
            <Participant
                onMouseEnter={hoverOn}
                onMouseLeave={hoverOff}
                $width={tileSizePropsMap[size].avatarSize + (tileSizePropsMap[size].padding * 2)}
                $padding={tileSizePropsMap[size].padding}
                $gap={tileSizePropsMap[size].gap}
                $hover={showHostControls}
            >
                {showHostControls &&
                    <StyledDotMenu
                        icon={
                            <StyledThreeDotsButton
                                data-testid={'three-dots-button'}
                                $size={tileSizePropsMap[size].dotMenuIconSize}
                            />
                        }
                        dotMenuButton={StyledDotMenuButton}
                        dropdownMenu={StyledDropdownMenu}
                        title={formatMessage({defaultMessage: 'Host controls'})}
                        placement={'bottom-start'}
                        strategy={'fixed'}
                        onOpenChange={onOpenChange}
                        $pos={size === TileSize.Small ? 2 : 4}
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
        <Participant
            $width={tileSizePropsMap[size].avatarSize + (tileSizePropsMap[size].padding * 2)}
            $padding={tileSizePropsMap[size].padding}
            $gap={tileSizePropsMap[size].gap}
        >
            {innerParticipant}
        </Participant>
    );
}

const MuteIconWrapper = styled.div<{$isMuted: boolean, $padding: number, $size: number}>`
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
  bottom: 0;
  right: 0;
  border-radius: 20px;
  padding: ${({$padding}) => $padding}px;
  background: ${({$isMuted}) => $isMuted ? 'color-mix(in srgb, var(--calls-bg), var(--button-color) 12%)' : '#3DB887'};

  svg {
    width: ${({$size}) => $size}px;
    height: ${({$size}) => $size}px;
    fill: white;
  }
`;

const StyledName = styled.span<{$fontSize: number, $lineHeight: number}>`
  font-weight: 600;
  text-align: center;
  font-size: ${({$fontSize}) => $fontSize}px;
  line-height: ${({$lineHeight}) => $lineHeight}px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: break-word;
  width: 100%;
`;

const ReactionWrapper = styled.div<{$isHandRaised: boolean, $padding: number, $size: number}>`
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
  bottom: 0;
  left: 0;
  border-radius: 20px;
  padding: ${({$padding}) => $padding}px;
  background: ${({$isHandRaised}) => $isHandRaised ? 'white' : 'color-mix(in srgb, var(--calls-bg), var(--button-color) 12%)'};
  font-size: ${({$size}) => $size}px;

  svg {
    width: ${({$size}) => $size}px;
    height: ${({$size}) => $size}px;
    fill: ${({$isHandRaised}) => $isHandRaised ? 'var(--away-indicator)' : 'white'};
  }
`;

const Participant = styled.li<{ $width: number, $gap: number, $padding: number, $hover?: boolean }>`
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    width: ${({$width}) => $width}px;
    gap: ${({$gap}) => $gap}px;
    padding: ${({$padding}) => $padding}px;

    ${({$hover}) => $hover && css`
        border-radius: 8px;
        background: rgba(var(--sidebar-text-rgb), 0.08);
    `}
`;

const StyledThreeDotsButton = styled(ThreeDotsButton)<{ $size: number }>`
    fill: rgba(var(--sidebar-text-rgb), 0.56);
    width: ${({$size}) => $size}px;
    height: ${({$size}) => $size}px;
`;

const StyledDotMenuButton = styled(DotMenuButton)`
    background-color: ${(props) => (props.$isActive ? 'rgba(var(--sidebar-text-rgb), 0.16)' : 'transparent')};

    &:hover {
        background-color: ${(props) => (props.$isActive ? 'rgba(var(--sidebar-text-rgb), 0.16)' : 'rgba(var(--sidebar-text-rgb), 0.16)')};
    }
`;

const StyledDotMenu = styled(DotMenu)<{$pos: number}>`
    position: absolute;
    top: ${({$pos}) => $pos}px;
    right: ${({$pos}) => $pos}px;
`;
