// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {forwardRef, useImperativeHandle, useState} from 'react';
import {useIntl} from 'react-intl';
import styled, {css} from 'styled-components';
import {OverlayTrigger} from 'react-bootstrap';
import EmojiPicker, {
    EmojiClickData,
    EmojiStyle,
    SkinTonePickerLocation,
    SuggestionMode,
} from 'emoji-picker-react';

import {EmojiData} from '@calls/common/lib/types';

import ControlsButton from 'src/components/expanded_view/controls_button';
import {MAKE_REACTION, RAISE_LOWER_HAND, reverseKeyMappings} from 'src/shortcuts';
import SmileyIcon from 'src/components/icons/smiley_icon';
import * as Telemetry from 'src/types/telemetry';
import {StyledTooltip} from 'src/components/shared';
import Shortcut from 'src/components/shortcut';
import CompassIcon from 'src/components/icons/compassIcon';
import HandEmoji from 'src/components/icons/hand';
import UnraisedHandIcon from 'src/components/icons/unraised_hand';
import {Emoji} from 'src/components/emoji/emoji';
import {EmojiIndicesByAlias} from 'src/emojis/emoji';

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
    const {formatMessage} = useIntl();

    useImperativeHandle(ref, () => ({
        toggle() {
            toggleReactions();
        },
    }));

    const callsClient = getCallsClient();
    const addReactionText = showBar ?
        formatMessage({defaultMessage: 'Close reactions'}) :
        formatMessage({defaultMessage: 'Add reaction'});

    const handleUserPicksEmoji = (ecd: EmojiClickData) => {
        const emojiData: EmojiData = {
            name: findEmojiName(ecd.names),
            skin: ecd.activeSkinTone,
            unified: ecd.unified.toLowerCase(),
            literal: ecd.emoji || '',
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
    const raiseHandText = isHandRaised ?
        formatMessage({defaultMessage: 'Lower hand'}) :
        formatMessage({defaultMessage: 'Raise hand'});
    const handIcon = isHandRaised ? (
        <UnraisedHandIcon
            style={{width: '20px', height: '20px', fill: 'var(--away-indicator)'}}
        />
    ) : <HandEmoji style={{width: '20px', height: '20px', fill: 'var(--away-indicator)'}}/>;

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
                        previewConfig={{showPreview: false}}
                        suggestedEmojisMode={SuggestionMode.RECENT}
                        height={316}
                        width={416}
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
                    <QuickSelectContainer>
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
                    </QuickSelectContainer>
                </Bar>
            }
            <ControlsButton
                id={'calls-popout-emoji-picker-button'}
                onToggle={toggleReactions}
                tooltipText={addReactionText}
                shortcut={reverseKeyMappings.popout[MAKE_REACTION][0]}
                bgColor={showBar ? 'white' : ''}
                bgColorHover={showBar ? 'rgba(255, 255, 255, 0.92)' : ''}
                iconFill={showBar ? 'rgba(var(--calls-bg-rgb), 0.80)' : ''}
                iconFillHover={showBar ? 'var(--calls-bg)' : ''}
                icon={
                    <SmileyIcon
                        style={{
                            width: '28px',
                            height: '28px',
                        }}
                    />
                }
            />
        </div>
    );
});

const findEmojiName = (names: string[]) => {
    // make underscore and hyphen versions to cover all possibilities
    names = names.flatMap((n) => {
        const ret = [n];
        ret.push(n.replaceAll(' ', '_'));
        ret.push(n.replaceAll(' ', '-'));

        // There will be some duplicates, but the map.has check below is far faster than a deduplication, so leaving them.
        return ret;
    });

    for (const name of names) {
        if (EmojiIndicesByAlias.has(name)) {
            return name;
        }
    }
    return '';
};

interface QuickSelectProps {
    emoji: EmojiData,
    handleClick: (e: EmojiClickData) => void
}

const QuickSelect = ({emoji, handleClick}: QuickSelectProps) => {
    const onClick = () => {
        handleClick({names: [emoji.name], unified: emoji.unified} as EmojiClickData);
    };

    return (
        <QuickSelectButton onClick={onClick}>
            <Emoji
                emoji={emoji}
                size={24}
            />
        </QuickSelectButton>
    );
};

const PickerContainer = styled.div`
    position: absolute;
    z-index: 1;
    top: -394px;
    left: -242px;

    // style the emoji selector
    &&&&&& {
        :host > #root {
            border: 1px solid;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        }
    }

    .EmojiPickerReact {
        --epr-emoji-size: 24px;
        --epr-bg-color: var(--center-channel-bg);
        --epr-category-label-bg-color: var(--center-channel-bg);
        --epr-picker-border-color: rgba(var(--center-channel-color-rgb), 0.16);
        --epr-search-border-color: rgba(var(--center-channel-color-rgb), 0.16);
        --epr-picker-border-radius: 4px;
        --epr-search-input-bg-color: var(--center-channel-bg);
        --epr-emoji-hover-color: rgba(var(--button-bg-rgb), 0.16);
        --epr-active-skin-hover-color: rgba(var(--button-bg-rgb), 0.16);
    }
`;

const Bar = styled.div`
    position: absolute;
    top: -68px;
    left: -242px;
    width: 416px;
    display: flex;
    justify-content: center;
    background: var(--center-channel-bg);
    color: rgba(var(--center-channel-color-rgb), 0.72);
    border: 1px solid rgba(var(--center-channel-color-rgb), 0.16);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    border-radius: 8px;
    padding: 8px;
    gap: 8px;
`;

const HandsButton = styled.button<{ active: boolean }>`
    border: none;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 4px;
    background: none;
    padding: 10px;
    gap: 4px;

    font-family: 'Open Sans', sans-serif;
    font-style: normal;
    font-weight: 600;
    font-size: 16px;
    line-height: 16px;

    :hover {
        background: rgba(var(--center-channel-color-rgb), 0.08);
    }

    ${({active}) => (active && css`
        background: rgba(255, 188, 31, 0.12);

        :hover {
            background: rgba(255, 188, 31, 0.2);
        }
    `)}
`;

const HandText = styled.span`
    white-space: nowrap;
    color: var(--center-channel-color);
`;

const QuickSelectContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 4px;
`;

const QuickSelectButton = styled.button<{ active?: boolean }>`
    border: none;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 4px;
    background: none;
    font-size: 24px;
    line-height: 24px;
    padding: 8px;

    :hover {
        background: rgba(var(--center-channel-color-rgb), 0.08);
    }

    .icon-emoticon-plus-outline:before {
      margin: 0;
    }

    ${({active}) => (active && css`
        background: var(--button-bg);
        color: var(--button-color);

        :hover {
            background: rgba(var(--button-bg-rgb), 0.92);
        }
    `)}
`;
