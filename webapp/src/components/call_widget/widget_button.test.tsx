// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import WidgetButton from './widget_button';

const renderButton = (props: Partial<React.ComponentProps<typeof WidgetButton>> = {}) => {
    const onToggle = jest.fn();
    const {container} = render(
        <WidgetButton
            id='widget-button'
            ariaLabel='Do the thing'
            icon={<svg/>}
            bgColor=''
            onToggle={onToggle}
            {...props}
        />,
    );
    return {container, onToggle, button: screen.getByRole('button', {name: 'Do the thing'})};
};

describe('WidgetButton', () => {
    test('should run the action when it is enabled', async () => {
        const user = userEvent.setup();
        const {button, onToggle} = renderButton();

        await user.click(button);

        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    test('should not run the action when it is disabled', async () => {
        const user = userEvent.setup();
        const {button, onToggle} = renderButton({disabled: true});

        await user.click(button);

        expect(onToggle).not.toHaveBeenCalled();
    });

    test('should tell assistive tech the button is unavailable when disabled', () => {
        const {button} = renderButton({disabled: true});

        expect(button).toBeDisabled();
    });

    test('should offer a pointer cursor only while it can be clicked', () => {
        const {button} = renderButton();

        expect(button).toHaveClass('cursor--pointer');
    });

    test('should not offer a pointer cursor when disabled', () => {
        const {button} = renderButton({disabled: true});

        expect(button).not.toHaveClass('cursor--pointer');
        expect(button).toHaveStyle('cursor: not-allowed');
    });

    test('should dim the icon when disabled so the state is visible', () => {
        const {container} = renderButton({disabled: true});

        expect(container.querySelector('svg')).toHaveStyle('fill: rgba(var(--center-channel-color-rgb),0.32)');
    });

    // The leave button relies on this: it swaps in a muted background while connecting, which the
    // disabled styling must not clear. A literal colour stands in for the CSS variable the widget
    // really passes, since jsdom does not resolve var().
    test('should keep the background it was given when disabled rather than clearing it', () => {
        const {button} = renderButton({disabled: true, bgColor: 'rgb(1, 2, 3)'});

        expect(button).toHaveStyle('background-color: rgb(1, 2, 3)');
    });

    test('should hide the tooltip while disabled so it cannot advertise an unavailable action', () => {
        renderButton({disabled: true, tooltipText: 'Do the thing'});

        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
});
