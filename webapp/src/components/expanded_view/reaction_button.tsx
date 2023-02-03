// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {forwardRef, useImperativeHandle, useState} from 'react';
import styled, {css} from 'styled-components';
import {OverlayTrigger} from 'react-bootstrap';
import EmojiPicker, {
    EmojiClickData,
    EmojiStyle,
    SkinTonePickerLocation,
    SuggestionMode,
    Theme,
} from 'emoji-picker-react';

import {HandRightOutlineIcon, HandRightOutlineOffIcon} from '@mattermost/compass-icons/components';

import {EmojiData} from '@mmcalls/common/src/types';

import ControlsButton from 'src/components/expanded_view/controls_button';
import {MAKE_REACTION, RAISE_LOWER_HAND, reverseKeyMappings} from 'src/shortcuts';
import SmileyIcon from 'src/components/icons/smiley_icon';
import * as Telemetry from 'src/types/telemetry';
import {StyledTooltip} from 'src/components/shared';
import Shortcut from 'src/components/shortcut';
import CompassIcon from 'src/components/icons/compassIcon';
import {Emoji} from 'src/components/emoji/emoji';

const EMOJI_VERSION = '13';

const getCallsClient = () => {
    return window.opener ? window.opener.callsClient : window.callsClient;
};

export type ReactionButtonRef = {
    toggle: () => void,
};

interface Props {
    trackEvent: (event: Telemetry.Event, source: Telemetry.Source, props?: Record<string, string>) => void,
}

export const ReactionButton = forwardRef(({trackEvent}: Props, ref) => {
    const [showPicker, setShowPicker] = useState(false);
    const [showBar, setShowBar] = useState(false);

    useImperativeHandle(ref, () => ({
        toggle() {
            toggleReactions();
        },
    }));

    const callsClient = getCallsClient();
    const addReactionText = showBar ? 'Close Reactions' : 'Add Reaction';

    const handleUserPicksEmoji = (ecd: EmojiClickData) => {
        const emojiData: EmojiData = {
            name: ecd.emoji,
            skin: ecd.activeSkinTone,
            unified: ecd.unified.toUpperCase(),
        };
        callsClient?.sendUserReaction(emojiData);
    };

    const onRaiseHandToggle = () => {
        if (isHandRaised) {
            trackEvent(Telemetry.Event.LowerHand, Telemetry.Source.ExpandedView, {initiator: 'button'});
            callsClient?.unraiseHand();
        } else {
            trackEvent(Telemetry.Event.RaiseHand, Telemetry.Source.ExpandedView, {initiator: 'button'});
            callsClient?.raiseHand();
        }
    };
    const isHandRaised = Boolean(callsClient?.isHandRaised);
    const raiseHandText = isHandRaised ? 'Lower hand' : 'Raise hand';
    const handIcon = isHandRaised ? (
        <HandRightOutlineOffIcon
            size={18}
            color={'rgba(255, 188, 66, 1)'}
        />
    ) : <HandRightOutlineIcon size={18}/>;

    const toggleShowPicker = () => {
        setShowPicker((showing) => !showing);
    };

    const toggleReactions = () => setShowBar((prev) => {
        if (prev && showPicker) {
            setShowPicker(false);
        }
        return !prev;
    });

    return (
        <div style={{position: 'relative'}}>
            {showPicker &&
                <PickerContainer>
                    <EmojiPicker
                        emojiVersion={EMOJI_VERSION}
                        emojiStyle={EmojiStyle.APPLE}
                        skinTonePickerLocation={SkinTonePickerLocation.SEARCH}
                        onEmojiClick={handleUserPicksEmoji}
                        autoFocusSearch={true}
                        theme={Theme.DARK}
                        previewConfig={{showPreview: false}}
                        suggestedEmojisMode={SuggestionMode.RECENT}
                        height={400}
                    />
                </PickerContainer>
            }
            {showBar &&
                <Bar>
                    <OverlayTrigger
                        key={'calls-popout-raisehand-button'}
                        placement='top'
                        overlay={
                            <StyledTooltip id={'tooltip-calls-popout-raisehand-button'}>
                                <div>{raiseHandText}</div>
                                <Shortcut shortcut={reverseKeyMappings.popout[RAISE_LOWER_HAND][0]}/>
                            </StyledTooltip>
                        }
                    >
                        <HandsButton
                            onClick={onRaiseHandToggle}
                            active={isHandRaised}
                        >
                            {handIcon}
                            <HandText>{raiseHandText}</HandText>
                        </HandsButton>
                    </OverlayTrigger>
                    <DividerLine/>
                    <QuickSelect
                        emoji={{name: '+1', unified: '1f44d'}}
                        handleClick={handleUserPicksEmoji}
                    />
                    <QuickSelect
                        emoji={{name: 'clap', unified: '1f44f'}}
                        handleClick={handleUserPicksEmoji}
                    />
                    <QuickSelect
                        emoji={{name: 'joy', unified: '1f602'}}
                        handleClick={handleUserPicksEmoji}
                    />
                    <QuickSelect
                        emoji={{name: 'heart', unified: '2764-fe0f'}}
                        handleClick={handleUserPicksEmoji}
                    />
                    <QuickSelect
                        emoji={{name: 'tada', unified: '1f389'}}
                        handleClick={handleUserPicksEmoji}
                    />
                    <QuickSelectButton
                        onClick={toggleShowPicker}
                        active={showPicker}
                    >
                        <CompassIcon icon='emoticon-plus-outline'/>
                    </QuickSelectButton>
                </Bar>
            }
            <ControlsButton
                id={'calls-popout-emoji-picker-button'}
                onToggle={toggleReactions}
                tooltipText={addReactionText}
                shortcut={reverseKeyMappings.popout[MAKE_REACTION][0]}
                bgColor={showBar ? '#DDDFE4' : ''}
                icon={
                    <SmileyIcon
                        style={{
                            width: '24px',
                            height: '24px',
                            fill: showBar ? '#090A0B' : '#FFFFFF',
                        }}
                    />
                }
            />
        </div>
    );
});

interface QuickSelectProps {
    emoji: EmojiData,
    handleClick: (e: EmojiClickData) => void
}

const QuickSelect = ({emoji, handleClick}: QuickSelectProps) => {
    const onClick = () => {
        handleClick({emoji: emoji.name, unified: emoji.unified} as EmojiClickData);
    };

    return (
        <QuickSelectButton onClick={onClick}>
            <Emoji emoji={emoji}/>
        </QuickSelectButton>
    );
};

const PickerContainer = styled.div`
    position: absolute;
    top: -462px;
    left: -129px;

    // style the emoji selector
    &&&&&& {
        :host > #root {
            border: 1px solid;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        }
    }

    .EmojiPickerReact {
        --epr-emoji-size: 24px;
        --epr-bg-color: #090A0B;
        --epr-category-label-bg-color: #090A0B;
        --epr-picker-border-color: rgba(221, 223, 228, 0.16);
        --epr-search-border-color: #5D89EA;
        --epr-picker-border-radius: 4px;
    }
`;

const Bar = styled.div`
    position: absolute;
    min-width: 351px; // to match the emoji picker
    top: -56px;
    left: -130px;
    display: flex;
    justify-content: center;
    background: #090A0B;
    border: 1px solid rgba(221, 223, 228, 0.16);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    border-radius: 4px;
    padding: 8px;
`;

const HandsButton = styled.button<{ active: boolean }>`
    border: none;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 4px;
    background: none;
    min-width: 120px;

    font-family: 'Open Sans', sans-serif;
    font-style: normal;
    font-weight: 600;
    font-size: 14px;
    line-height: 14px;

    :hover {
        background: rgba(221, 223, 228, 0.08);
    }

    ${({active}) => (active && css`
        background: rgba(245, 171, 0, 0.24);

        :hover {
            background: rgba(245, 171, 0, 0.40);
        }
    `)}
`;

const HandText = styled.span`
    margin: 0 3px;
    white-space: nowrap;
`;

const DividerLine = styled.div`
    width: 0;
    margin: 0 2px 0 4px;
    height: 32px;
    border: 1px solid rgba(221, 223, 228, 0.16);
`;

const QuickSelectButton = styled.button<{ active?: boolean }>`
    border: none;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 4px;
    background: none;
    font-size: 18px;
    margin-left: 2px;

    :hover {
        background: rgba(221, 223, 228, 0.08);
    }

    ${({active}) => (active && css`
        background: rgba(93, 137, 234, 0.16);
        color: #5D89EA;

        :hover {
            background: rgba(93, 137, 234, 0.32);
        }
    `)}
`;
