// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {createIntl, RawIntlProvider} from 'react-intl';
import {DTMF_DIGITS} from 'src/dtmf';

import {DialPadPanel} from './dial_pad_panel';

const intl = createIntl({locale: 'en', messages: {}});

const MESSAGE_BOX_LABEL = 'message box';

describe('DialPadPanel', () => {
    const renderPanel = (overrides: {digits?: string; hasError?: boolean} = {}) => {
        const props = {
            digits: '',
            hasError: false,
            onPress: jest.fn(),
            onClose: jest.fn(),
            ...overrides,
        };
        render(
            <RawIntlProvider value={intl}>
                <DialPadPanel {...props}/>
                <input aria-label={MESSAGE_BOX_LABEL}/>
            </RawIntlProvider>,
        );
        return props;
    };

    test('renders the title and a key for every digit, with no "+" on zero', () => {
        renderPanel();

        expect(screen.getByText('Dial pad')).toBeInTheDocument();
        for (const digit of DTMF_DIGITS) {
            expect(screen.getByRole('button', {name: `Dial pad ${digit}`})).toBeInTheDocument();
        }
        expect(screen.getByRole('button', {name: 'Dial pad 0'})).toHaveTextContent(/^0$/);
        expect(screen.queryByText('+')).not.toBeInTheDocument();
    });

    test('shows the digits as text, not as an editable field', () => {
        renderPanel({digits: '4815#'});

        expect(screen.getByTestId('calls-widget-dial-pad-digits')).toHaveTextContent('4815#');
        expect(screen.getAllByRole('textbox')).toEqual([screen.getByRole('textbox', {name: MESSAGE_BOX_LABEL})]);
        expect(screen.queryByPlaceholderText(/enter number/i)).not.toBeInTheDocument();
    });

    test('clicking a key presses that digit', async () => {
        const user = userEvent.setup();
        const {onPress} = renderPanel();

        await user.click(screen.getByRole('button', {name: 'Dial pad 7'}));
        await user.click(screen.getByRole('button', {name: 'Dial pad *'}));

        expect(onPress.mock.calls).toEqual([['7'], ['*']]);
    });

    test('the close button calls onClose', async () => {
        const user = userEvent.setup();
        const {onClose} = renderPanel();

        await user.click(screen.getByRole('button', {name: 'Close dial pad'}));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('shows an error only when a send has failed', () => {
        renderPanel({hasError: true});

        expect(screen.getByRole('alert')).toHaveTextContent('Couldn\'t send that digit. Try again.');
    });

    test('shows no error by default', () => {
        renderPanel();

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    describe('keyboard', () => {
        test('sends each digit key once and keeps it from reaching the host webapp', () => {
            const hostKeyHandler = jest.fn();
            document.addEventListener('keydown', hostKeyHandler);
            const {onPress} = renderPanel();

            fireEvent.keyDown(document.body, {key: '9'});
            fireEvent.keyDown(document.body, {key: '#', shiftKey: true});
            fireEvent.keyDown(document.body, {key: '*', shiftKey: true});

            expect(onPress.mock.calls).toEqual([['9'], ['#'], ['*']]);
            expect(hostKeyHandler).not.toHaveBeenCalled();
            document.removeEventListener('keydown', hostKeyHandler);
        });

        test('shows the pressed state on the matching key', () => {
            renderPanel();

            fireEvent.keyDown(document.body, {key: '5'});

            expect(screen.getByRole('button', {name: 'Dial pad 5'})).toHaveClass('DialPadKeypad__key--pressed');
        });

        test('ignores held keys, shortcuts and other keys', () => {
            const {onPress} = renderPanel();

            fireEvent.keyDown(document.body, {key: '1', repeat: true});
            fireEvent.keyDown(document.body, {key: '1', ctrlKey: true});
            fireEvent.keyDown(document.body, {key: '1', metaKey: true});
            fireEvent.keyDown(document.body, {key: '1', altKey: true});
            fireEvent.keyDown(document.body, {key: '+', shiftKey: true});
            fireEvent.keyDown(document.body, {key: 'a'});

            expect(onPress).not.toHaveBeenCalled();
        });

        test('ignores keys typed into a text field', () => {
            const {onPress} = renderPanel();

            fireEvent.keyDown(screen.getByRole('textbox', {name: MESSAGE_BOX_LABEL}), {key: '1'});

            expect(onPress).not.toHaveBeenCalled();
        });
    });
});
