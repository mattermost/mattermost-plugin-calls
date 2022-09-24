// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {getEmojiImageUrl} from 'mattermost-redux/utils/emoji_utils';

import {EmojiData} from 'src/types/types';
import {Emojis, EmojiIndicesByUnicode} from 'src/emoji';

type Props = {
    emoji?: EmojiData,
};

const getEmojiURL = (emoji: EmojiData) => {
    const index = EmojiIndicesByUnicode.get(emoji.unified.toLowerCase());
    if (typeof index === 'undefined') {
        return '';
    }
    return getEmojiImageUrl(Emojis[index]);
};

export const Emoji = (props: Props) => {
    if (props.emoji) {
        return (
            <span
                className='emoticon'
                title={props.emoji.name}
                style={{
                    backgroundImage: `url(${getEmojiURL(props.emoji)})`,
                    width: '18px',
                    minWidth: '18px',
                    height: '18px',
                    minHeight: '18px',
                }}
            >
                {props.emoji.name}
            </span>
        );
    }
    return null;
};