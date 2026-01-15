// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';
import {useSelector} from 'react-redux';
import {liveCaptionsInCurrentCall, captionLanguage, liveCaptionsEnabled} from 'src/selectors';
import {untranslatable} from 'src/utils';
import translationService from 'src/translation_service';
import {logDebug} from 'src/log';
import styled from 'styled-components';

const TranslatedCaption = ({caption}: {caption: any}) => {
    const userLanguage = useSelector(captionLanguage);
    const [translatedText, setTranslatedText] = useState(caption.text);
    const [isTranslating, setIsTranslating] = useState(false);

    useEffect(() => {
        const translateCaption = async () => {
            // Get source language from caption data (sent by server)
            const sourceLanguage = caption.language || 'en';

            // Skip if no translation needed
            if (!userLanguage || userLanguage === '' || userLanguage === sourceLanguage) {
                setTranslatedText(caption.text);
                return;
            }

            setIsTranslating(true);
            logDebug(`Translating caption from ${sourceLanguage} to ${userLanguage}`);

            try {
                const translated = await translationService.translate(
                    caption.text,
                    sourceLanguage,
                    userLanguage,
                );

                if (translated) {
                    setTranslatedText(translated);
                } else {
                    // Translation not available, use original
                    setTranslatedText(caption.text);
                }
            } catch (err) {
                // Fallback to original text on error
                setTranslatedText(caption.text);
            } finally {
                setIsTranslating(false);
            }
        };

        translateCaption();
    }, [caption.text, caption.language, userLanguage]);

    return (
        <Caption key={caption.caption_id}>
            {untranslatable(`(${caption.display_name}) ${translatedText}`)}
            {isTranslating && <TranslatingIndicator>...</TranslatingIndicator>}
        </Caption>
    );
};

export const LiveCaptionsStream = () => {
    const captions = useSelector(liveCaptionsInCurrentCall);
    const captionsArr = Object.values(captions);
    const liveCaptionsOn = useSelector(liveCaptionsEnabled);

    if (!liveCaptionsOn || captionsArr.length === 0) {
        return null;
    }

    const renderedCaptions = captionsArr.map((val) => (
        <TranslatedCaption
            key={val.caption_id}
            caption={val}
        />
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

const TranslatingIndicator = styled.span`
    margin-left: 4px;
    opacity: 0.6;
    font-size: 14px;
`;
