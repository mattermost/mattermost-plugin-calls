// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './dial_pad_panel.scss';

import React, {useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import CompassIcon from 'src/components/icons/compassIcon';
import {DTMFDigit, isDTMFDigit} from 'src/dtmf';

import {DialPadKeypad} from './dial_pad_keypad';

const PRESSED_FEEDBACK_MS = 150;

type Props = {
    digits: string;
    hasError: boolean;
    onPress: (digit: DTMFDigit) => void;
    onClose: () => void;
};

function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function DialPadPanel({digits, hasError, onPress, onClose}: Props) {
    const {formatMessage} = useIntl();
    const [pressedDigit, setPressedDigit] = useState<DTMFDigit | null>(null);

    useEffect(() => {
        let pressedTimer: ReturnType<typeof setTimeout> | undefined;

        const onKeyDown = (ev: KeyboardEvent) => {
            const key = ev.key;
            if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey || !isDTMFDigit(key) || isEditableTarget(ev.target)) {
                return;
            }

            // Stops the host webapp from moving focus to the message box and typing the digit there.
            ev.preventDefault();
            ev.stopPropagation();

            onPress(key);
            setPressedDigit(key);
            clearTimeout(pressedTimer);
            pressedTimer = setTimeout(() => setPressedDigit(null), PRESSED_FEEDBACK_MS);
        };

        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.removeEventListener('keydown', onKeyDown, true);
            clearTimeout(pressedTimer);
        };
    }, [onPress]);

    const title = formatMessage({defaultMessage: 'Dial pad'});

    return (
        <div
            id='calls-widget-dial-pad'
            className='DialPadPanel'
            role='group'
            aria-label={title}
        >
            <div className='DialPadPanel__header'>
                <span className='DialPadPanel__title'>{title}</span>
                <button
                    type='button'
                    className='DialPadPanel__close'
                    aria-label={formatMessage({defaultMessage: 'Close dial pad'})}
                    onClick={onClose}
                >
                    <CompassIcon icon='close'/>
                </button>
            </div>
            <div
                className='DialPadPanel__digits'
                data-testid='calls-widget-dial-pad-digits'
                aria-live='polite'
            >
                <span>{digits}</span>
            </div>
            {hasError && (
                <div
                    className='DialPadPanel__error'
                    role='alert'
                >
                    {formatMessage({defaultMessage: 'Couldn\'t send that digit. Try again.'})}
                </div>
            )}
            <DialPadKeypad
                onPress={onPress}
                pressedDigit={pressedDigit}
            />
        </div>
    );
}
