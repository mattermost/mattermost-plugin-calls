// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {EmojiData} from '@mattermost/calls-common/lib/types';
import {getEmojiImageUrl} from 'mattermost-redux/utils/emoji_utils';
import React from 'react';
import {EmojiIndicesByUnicode, Emojis} from 'src/emojis/emoji';

interface Props {
    emoji?: EmojiData;
    size?: number;
}

export const Emoji = ({emoji, size}: Props) => {
    if (!emoji) {
        return null;
    }
    const sizePx = size ? `${size}px` : null;
    return (
        <span
            className='emoticon'
            title={emoji.name}
            style={{
                backgroundImage: `url(${getEmojiURL(emoji)})`,
                width: sizePx || '18px',
                minWidth: sizePx || '18px',
                height: sizePx || '18px',
                minHeight: sizePx || '18px',
            }}
        >
            {emoji.name}
        </span>
    );
};

const getEmojiURL = (emoji: EmojiData) => {
    const index = EmojiIndicesByUnicode.get(emoji.unified.toLowerCase());
    if (typeof index === 'undefined') {
        return '';
    }
    return getEmojiImageUrl(Emojis[index]);
};
