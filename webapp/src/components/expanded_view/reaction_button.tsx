// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {forwardRef, RefObject, useImperativeHandle, useRef, useState} from 'react';
import Picker from '@emoji-mart/react';

import styled, {css} from 'styled-components';

import {OverlayTrigger} from 'react-bootstrap';

import ControlsButton from 'src/components/expanded_view/controls_button';
import {MAKE_REACTION, RAISE_LOWER_HAND, reverseKeyMappings} from 'src/shortcuts';
import SmileyIcon from 'src/components/icons/smiley_icon';
import UnraisedHandIcon from 'src/components/icons/unraised_hand';
import RaisedHandIcon from 'src/components/icons/raised_hand';
import * as Telemetry from 'src/types/telemetry';
import {StyledTooltip} from 'src/components/shared';
import Shortcut from 'src/components/shortcut';
import CompassIcon from 'src/components/icons/compassIcon';
import {Emoji} from 'src/components/emoji/emoji';
import {EmojiData} from 'src/types/types';

const EMOJI_VERSION = '13';
const EMOJI_SKINTONE_MAP = new Map([[1, ''], [2, '1F3FB'], [3, '1F3FC'], [4, '1F3FD'], [5, '1F3FE'], [6, '1F3FF']]);

interface EmojiPickEvent {
    id: string;
    keywords?: string[]
    name?: string;
    native?: string;
    shortcodes?: string;
    skin?: number;
    unified: string;
}

const getCallsClient = () => {
    return window.opener ? window.opener.callsClient : window.callsClient;
};

export type ReactionButtonRef = {
    toggle: () => void,
};

interface Props {
    trackEvent: (event: Telemetry.Event, source: Telemetry.Source, props?: Record<string, any>) => void,
}

export const ReactionButton = forwardRef(({trackEvent}: Props, ref) => {
    const barRef: RefObject<HTMLDivElement> = useRef<HTMLDivElement>(null);
    const [showPicker, setShowPicker] = useState(false);
    const [showBar, setShowBar] = useState(false);
    useImperativeHandle(ref, () => ({
        toggle() {
            toggleReactions();
        },
    }));

    const callsClient = getCallsClient();
    const isHandRaised = callsClient.isHandRaised;
    const HandIcon = isHandRaised ? UnraisedHandIcon : RaisedHandIcon;
    const addReactionText = showBar ? 'Close Reactions' : 'Add Reaction';
    const raiseHandText = isHandRaised ? 'Lower hand' : 'Raise hand';

    const handleUserPicksEmoji = (ev: EmojiPickEvent) => {
        const emojiData = {
            name: ev.id,
            skin: ev.skin ? EMOJI_SKINTONE_MAP.get(ev.skin) : undefined, // eslint-disable-line no-undefined
            unified: ev.unified.toUpperCase(),
        };
        callsClient.sendUserReaction(emojiData);
    };

    const onRaiseHandToggle = () => {
        if (isHandRaised) {
            trackEvent(Telemetry.Event.LowerHand, Telemetry.Source.ExpandedView, {initiator: 'button'});
            callsClient.unraiseHand();
        } else {
            trackEvent(Telemetry.Event.RaiseHand, Telemetry.Source.ExpandedView, {initiator: 'button'});
            callsClient.raiseHand();
        }
    };

    const toggleShowPicker = () => setShowPicker((prev) => !prev);
    const toggleReactions = () => setShowBar((prev) => !prev);

    return (
        <div style={{position: 'relative'}}>
            {showPicker &&
                <PickerContainer>
                    <Picker
                        emojiVersion={EMOJI_VERSION}
                        skinTonePosition='search'
                        onEmojiSelect={handleUserPicksEmoji}
                        onClickOutside={toggleShowPicker}
                        autoFocus={true}
                        perLine={9}
                        emojiButtonSize={35}
                        emojiSize={24}
                        previewPosition={'none'}
                    />
                </PickerContainer>
            }
            {showBar &&
                <Bar ref={barRef}>
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
                            <HandIcon
                                style={{
                                    width: '18px',
                                    height: '18px',
                                    fill: isHandRaised ? 'rgba(255, 188, 66, 1)' : 'white',
                                }}
                            />
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
                            width: '28px',
                            height: '28px',
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
    handleClick: (e: EmojiPickEvent) => void
}

const QuickSelect = ({emoji, handleClick}: QuickSelectProps) => {
    const onClick = () => {
        handleClick({id: emoji.name, unified: emoji.unified});
    };

    return (
        <QuickSelectButton onClick={onClick}>
            <Emoji emoji={emoji}/>
        </QuickSelectButton>
    );
};

const PickerContainer = styled.div`
    position: absolute;
    top: -496px;
    left: -129px;

    // style the emoji selector
    &&&&&& {
        :host > #root {
            border: 1px solid;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        }
    }
`;

const Bar = styled.div`
    position: absolute;
    min-width: 343px; // to match the emoji picker
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

    ${({active}) => (active && css`
        background: rgba(245, 171, 0, 0.24);
    `)}
    :hover {
        background: rgba(245, 171, 0, 0.12);
    }
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
        background: rgba(255, 255, 255, 0.24);
    }

    ${({active}) => (active && css`
        background: rgba(255, 255, 255, 0.92);
        color: #1C58D9;
    `)}
`;
