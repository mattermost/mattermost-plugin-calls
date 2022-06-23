// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import styled from 'styled-components';

import {useFloating, offset, flip, shift, Placement} from '@floating-ui/react-dom';

import {useKeyPress, useClickOutsideRef} from 'src/hooks';
import {PrimaryButton} from 'src/components/assets/buttons';

import Tooltip from 'src/components/widgets/tooltip';
import {useUniqueId} from 'src/utils';

export const DotMenuButton = styled.div<{isActive: boolean}>`
    display: inline-flex;
    padding: 0;
    border: none;
    border-radius: 4px;
    width: 3.2rem;
    height: 3.2rem;
    fill: rgba(var(--center-channel-color-rgb), 0.56);
    cursor: pointer;
    color: ${(props) => (props.isActive ? 'var(--button-bg)' : 'rgba(var(--center-channel-color-rgb), 0.56)')};
    background-color: ${(props) => (props.isActive ? 'rgba(var(--button-bg-rgb), 0.08)' : 'transparent')};
    &:hover {
        color: ${(props) => (props.isActive ? 'var(--button-bg)' : 'rgba(var(--center-channel-color-rgb), 0.56)')};
        background-color: ${(props) => (props.isActive ? 'rgba(var(--button-bg-rgb), 0.08)' : 'rgba(var(--center-channel-color-rgb), 0.08)')};
    }
`;

const DropdownMenuWrapper = styled.div`
    position: relative;
`;

interface DropdownMenuProps {
    top?: boolean;
    left?: boolean;
    wide?: boolean;
    topPx?: number;
    leftPx?: number;
}

export const DropdownMenu = styled.div<DropdownMenuProps>`
    display: flex;
    flex-direction: column;
    width: max-content;
    min-width: 160px;
    text-align: left;
    list-style: none;
    padding: 10px 0;
    font-family: Open Sans;
    font-style: normal;
    font-weight: normal;
    font-size: 14px;
    line-height: 20px;
    color: var(--center-channel-color);
    background: var(--center-channel-bg);
    border: 1px solid rgba(var(--center-channel-color-rgb), 0.16);
    box-shadow: 0px 8px 24px rgba(0, 0, 0, 0.12);
    border-radius: 4px;
    z-index: 12;
`;

interface DotMenuProps {
    children: React.ReactNode;
    icon: JSX.Element;
    dotMenuButton?: typeof DotMenuButton | typeof PrimaryButton;
    dropdownMenu?: typeof DropdownMenu;
    placement?: Placement;
    offset?: Parameters<typeof offset>[0];
    title?: string;
    disabled?: boolean;
    className?: string;
    isActive?: boolean;
}

const DotMenu = (props: DotMenuProps) => {
    const {strategy, x, y, reference, floating, refs} = useFloating<HTMLElement>({
        placement: props.placement ?? 'bottom',
        middleware: [offset(props.offset ?? 2), flip(), shift()],
    });

    const [isOpen, setOpen] = useState(false);
    const toggleOpen = () => {
        setOpen(true);
    };

    useClickOutsideRef(refs.reference, () => {
        setOpen(false);
    });

    useKeyPress('Escape', () => {
        setOpen(false);
    });

    const MenuButton = props.dotMenuButton ?? DotMenuButton;
    const Menu = props.dropdownMenu ?? DropdownMenu;

    return (

        // @ts-ignore
        <MenuButton
            title={props.title}
            ref={reference}
            isActive={(props.isActive ?? false) || isOpen}
            onClick={(e: MouseEvent) => {
                e.stopPropagation();
                toggleOpen();
            }}
            onKeyDown={(e: KeyboardEvent) => {
                // Handle Enter and Space as clicking on the button
                if (e.key === 'Space' || e.key === 'Enter') {
                    e.stopPropagation();
                    toggleOpen();
                }
            }}
            tabIndex={0}
            className={props.className}
            role={'button'}
            disabled={props.disabled || false}
        >
            {props.icon}
            <DropdownMenuWrapper>
                {
                    isOpen &&
                    <Menu
                        ref={floating}
                        style={{
                            position: strategy,
                            top: y ?? '',
                            left: x ?? '',
                        }}
                        data-testid='dropdownmenu'
                        onClick={(e) => {
                            e.stopPropagation();
                            setOpen(false);
                        }}
                    >
                        {props.children}
                    </Menu>
                }
            </DropdownMenuWrapper>
        </MenuButton>
    );
};

export const DropdownMenuItemStyled = styled.a`
 && {
    font-family: 'Open Sans';
    font-style: normal;
    font-weight: normal;
    font-size: 14px;
    color: var(--center-channel-color);
    padding: 10px 20px;
    text-decoration: unset;
    &:hover {
        background: rgba(var(--center-channel-color-rgb), 0.08);
        color: var(--center-channel-color);
    }
}
`;

export const DisabledDropdownMenuItemStyled = styled.div`
 && {
    cursor: default;
    font-family: 'Open Sans';
    font-style: normal;
    font-weight: normal;
    font-size: 14px;
    color: var(--center-channel-color-40);
    padding: 10px 20px;
    text-decoration: unset;
}
`;

export const DropdownMenuItem = (props: { children: React.ReactNode, onClick: () => void, className?: string, disabled?: boolean, disabledAltText?: string }) => {
    const tooltipId = useUniqueId();

    if (props.disabled) {
        return (
            <Tooltip
                id={tooltipId}
                content={props.disabledAltText}
            >
                <DisabledDropdownMenuItemStyled
                    className={props.className}
                >
                    {props.children}
                </DisabledDropdownMenuItemStyled>
            </Tooltip>
        );
    }

    return (
        <DropdownMenuItemStyled
            href='#'
            onClick={props.onClick}
            className={props.className}
            role={'button'}

            // Prevent trigger icon (parent) from propagating title prop to options
            // Menu items use to be full text (not just icons) so don't need title
            title=''
        >
            {props.children}
        </DropdownMenuItemStyled>
    );
};

export default DotMenu;
