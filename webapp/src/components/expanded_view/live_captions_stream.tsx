// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useSelector} from 'react-redux';
import {liveCaptionsInCurrentCall} from 'src/selectors';
import {untranslatable} from 'src/utils';
import styled from 'styled-components';

export const LiveCaptionsStream = () => {
    const captions = useSelector(liveCaptionsInCurrentCall);
    const captionsArr = Object.values(captions);

    if (captionsArr.length === 0) {
        return null;
    }

    const renderedCaptions = captionsArr.map((val) => (
        <Caption key={val.caption_id}>
            {untranslatable(`(${val.display_name}) ${val.text}`)}
        </Caption>
    ));

    return (
        <CaptionContainer>
            {renderedCaptions}
        </CaptionContainer>
    );
};

const CaptionContainer = styled.div`
    width: 70vw;
    max-width: 600px;
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 2;
    gap: 10px;
`;

const Caption = styled.div`
    display: flex;
    padding: 1px 8px 3px 8px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.64);
    text-align: center;
    font-size: 18px;
    font-weight: 400;
    line-height: 24px; /* 133.333% */
`;
