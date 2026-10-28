// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './dial_pad_keypad.scss';

import classNames from 'classnames';
import React from 'react';
import {useIntl} from 'react-intl';
import {DTMF_DIGITS, DTMFDigit} from 'src/dtmf';

const KEY_LETTERS: Partial<Record<DTMFDigit, string>> = {
    2: 'ABC',
    3: 'DEF',
    4: 'GHI',
    5: 'JKL',
    6: 'MNO',
    7: 'PQRS',
    8: 'TUV',
    9: 'WXYZ',
};

type Props = {
    onPress: (digit: DTMFDigit) => void;
    pressedDigit?: DTMFDigit | null;
};

export function DialPadKeypad({onPress, pressedDigit}: Props) {
    const {formatMessage} = useIntl();

    return (
        <div className='DialPadKeypad'>
            {DTMF_DIGITS.map((digit) => (
                <button
                    key={digit}
                    type='button'
                    className={classNames('DialPadKeypad__key', {'DialPadKeypad__key--pressed': pressedDigit === digit})}
                    aria-label={formatMessage({defaultMessage: 'Dial pad {digit}'}, {digit})}
                    onClick={() => onPress(digit)}
                >
                    <span className='DialPadKeypad__digit'>{digit}</span>
                    {KEY_LETTERS[digit] && (
                        <span
                            className='DialPadKeypad__letters'
                            aria-hidden='true'
                        >
                            {KEY_LETTERS[digit]}
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
}
