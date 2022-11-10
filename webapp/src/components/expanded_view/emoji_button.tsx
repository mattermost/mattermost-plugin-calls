// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {forwardRef, Ref, useImperativeHandle, useState} from 'react';
import Picker from '@emoji-mart/react';

import styled from 'styled-components';

import ControlsButton from 'src/components/expanded_view/controls_button';
import {MAKE_REACTION, reverseKeyMappings} from 'src/shortcuts';
import SmileyIcon from 'src/components/icons/smiley_icon';

const EMOJI_VERSION = '13';
const EMOJI_SKINTONE_MAP = new Map([[1, ''], [2, '1F3FB'], [3, '1F3FC'], [4, '1F3FD'], [5, '1F3FE'], [6, '1F3FF']]);

interface EmojiPickEvent {
    id: string;
    keywords: string[]
    name: string;
    native: string;
    shortcodes: string;
    skin?: number;
    unified: string;
}

const getCallsClient = () => {
    return window.opener ? window.opener.callsClient : window.callsClient;
};

export type EmojiButtonRef = {
    toggle: () => void,
};

export const EmojiButton = forwardRef((props, ref) => {
    const [showPicker, setShowPicker] = useState(false);
    useImperativeHandle(ref, () => ({
        toggle() {
            toggleShowPicker();
        },
    }));

    const addReactionText = 'Add Reaction';

    const handleUserPicksEmoji = (ev: EmojiPickEvent) => {
        const callsClient = getCallsClient();
        const emojiData = {
            name: ev.id,
            skin: ev.skin ? EMOJI_SKINTONE_MAP.get(ev.skin) : undefined, // eslint-disable-line no-undefined
            unified: ev.unified.toUpperCase(),
        };
        callsClient.sendUserReaction(emojiData);
    };

    const toggleShowPicker = () => setShowPicker((prev) => !prev);

    return (
        <div style={{position: 'relative'}}>
            {showPicker &&
                <Container>
                    <Picker
                        emojiVersion={EMOJI_VERSION}
                        skinTonePosition='search'
                        onEmojiSelect={handleUserPicksEmoji}
                        onClickOutside={toggleShowPicker}
                        autoFocus={true}
                        perLine={12}
                    />
                </Container>
            }
            <ControlsButton
                id={'calls-popout-emoji-picker-button'}
                onToggle={toggleShowPicker}
                tooltipText={addReactionText}
                shortcut={reverseKeyMappings.popout[MAKE_REACTION][0]}
                bgColor={showPicker ? 'rgba(255, 255, 255, 0.56)' : ''}
                icon={
                    <SmileyIcon
                        style={{width: '28px', height: '28px'}}
                        fill={showPicker ? '#3F4350' : '#FFFFFF'}
                    />
                }
            />
        </div>

    );
});

const Container = styled.div`
    position: absolute;
    top: -445px;
    left: -75px;
`;
