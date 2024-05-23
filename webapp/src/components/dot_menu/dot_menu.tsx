// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ComponentProps, useState} from 'react';
import {PrimaryButton} from 'src/components/buttons';
import styled from 'styled-components';

import Dropdown from './dropdown';

export const DotMenuButton = styled.div<{ $isActive: boolean }>`
    display: inline-flex;
    padding: 0;
    border: none;
    border-radius: 4px;
    width: 28px;
    height: 28px;
    align-items: center;
    justify-content: center;
    fill: rgba(var(--center-channel-color-rgb), 0.56);
    cursor: pointer;

    color: ${(props) => (props.$isActive ? 'var(--button-bg)' : 'rgba(var(--center-channel-color-rgb), 0.56)')};
    background-color: ${(props) => (props.$isActive ? 'rgba(var(--button-bg-rgb), 0.08)' : 'transparent')};

    &:hover {
        color: ${(props) => (props.$isActive ? 'var(--button-bg)' : 'rgba(var(--center-channel-color-rgb), 0.56)')};
        background-color: ${(props) => (props.$isActive ? 'rgba(var(--button-bg-rgb), 0.08)' : 'rgba(var(--center-channel-color-rgb), 0.08)')};
    }
`;

export const DropdownMenu = styled.div`
    display: flex;
    flex-direction: column;

    width: max-content;
    min-width: 16rem;
    text-align: left;
    list-style: none;

    padding: 8px 0;
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

type DotMenuProps = {
    children: React.ReactNode;
    icon: JSX.Element;
    dotMenuButton?: typeof DotMenuButton | typeof PrimaryButton;
    dropdownMenu?: typeof DropdownMenu;
    title?: string;
    disabled?: boolean;
    className?: string;
    isActive?: boolean;
    closeOnClick?: boolean;
    onOpenChange?: (open: boolean) => void;
};

type DropdownProps = Omit<ComponentProps<typeof Dropdown>, 'target' | 'children' | 'isOpen'>;

const DotMenu = ({
    children,
    icon,
    title,
    className,
    disabled,
    isActive,
    onOpenChange,
    closeOnClick = true,
    dotMenuButton: MenuButton = DotMenuButton,
    dropdownMenu: Menu = DropdownMenu,
    ...props
}: DotMenuProps & DropdownProps) => {
    const [isOpen, setOpen] = useState(false);
    const setOpenWrapper = (open: boolean) => {
        onOpenChange?.(open);
        setOpen(open);
    };
    const toggleOpen = () => {
        setOpenWrapper(!isOpen);
    };

    const button = (

        // @ts-ignore
        <MenuButton
            title={title}
            $isActive={(isActive ?? false) || isOpen}
            onClick={(e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                toggleOpen();
            }}
            onKeyUp={(e: KeyboardEvent) => {
                // Handle Enter and Space as clicking on the button
                if (e.key === 'Space' || e.key === 'Enter') {
                    e.stopPropagation();
                    toggleOpen();
                }
            }}
            tabIndex={0}
            className={className}
            role={'button'}
            disabled={disabled ?? false}
            data-testid={'menuButton' + (title ?? '')}
        >
            {icon}
        </MenuButton>
    );

    return (
        <Dropdown
            {...props}
            isOpen={isOpen}
            onOpenChange={setOpenWrapper}
            target={button}
        >
            <Menu
                data-testid='dropdownmenu'
                onClick={(e) => {
                    e.stopPropagation();
                    if (closeOnClick) {
                        setOpenWrapper(false);
                    }
                }}
            >
                {children}
            </Menu>
        </Dropdown>
    );
};

const DropdownMenuItemStyled = styled.div`
    font-family: 'Open Sans';
    font-style: normal;
    font-weight: normal;
    font-size: 14px;
    color: var(--center-channel-color);
    padding: 6px 16px;
    text-decoration: unset;
    display: inline-flex;
    align-items: center;

    > .icon {
        margin-right: 8px;
    }

    &:hover {
        background: rgba(var(--center-channel-color-rgb), 0.08);
        color: var(--center-channel-color);
    }

    &&:focus {
        text-decoration: none;
        color: inherit;
    }
`;

export const DropdownMenuItem = (props: {
    children: React.ReactNode,
    onClick?: () => void,
    className?: string,
}) => {
    return (
        <DropdownMenuItemStyled
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

export const DropdownMenuSeparator = styled.div`
    display: flex;
    align-content: center;
    border-top: 1px solid rgba(var(--center-channel-color-rgb), 0.08);
    margin: 8px auto;
    width: 100%;
`;

export default DotMenu;
