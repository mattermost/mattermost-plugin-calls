// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {getEmojiImageUrl} from 'mattermost-redux/utils/emoji_utils';

import {EmojiData} from 'src/types/types';
import {Emojis, EmojiIndicesByUnicode} from 'src/emojis/emoji';

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

export const Emoji = ({emoji}: Props) => {
    if (!emoji) {
        return null;
    }

    return (
        <span
            className='emoticon'
            title={emoji.name}
            style={{
                backgroundImage: `url(${getEmojiURL(emoji)})`,
                width: '18px',
                minWidth: '18px',
                height: '18px',
                minHeight: '18px',
            }}
        >
            {emoji.name}
        </span>
    );
};
