// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ComponentProps, useRef, useState} from 'react';
import {Overlay} from 'react-bootstrap';
import {PrimaryButton} from 'src/components/buttons';
import {StyledTooltip} from 'src/components/shared';
import Shortcut from 'src/components/shortcut';
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
    id?: string;
    shortcut?: string,
    tooltipText?: string,
    tooltipSubtext?: string,
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
    id,
    shortcut,
    tooltipText,
    tooltipSubtext,
    ...props
}: DotMenuProps & DropdownProps) => {
    const [isOpen, setOpen] = useState(false);
    const [isHover, setIsHover] = useState(false);
    const target = useRef<HTMLDivElement>(null);
    const setOpenWrapper = (open: boolean) => {
        onOpenChange?.(open);
        setOpen(open);
    };
    const toggleOpen = () => {
        setOpenWrapper(!isOpen);
    };

    const button = (
        <div
            className={className}
            onMouseEnter={() => setIsHover(true)}
            onMouseLeave={() => setIsHover(false)}
        >
            {/*@ts-ignore*/}
            <MenuButton
                ref={target}
                id={id}
                title={title}
                $isActive={(isActive ?? false) || isOpen}
                onClick={(e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleOpen();
                }}
                role={'button'}
                disabled={disabled ?? false}
                data-testid={'menuButton' + (title ?? '')}
            >
                {icon}
            </MenuButton>
            {tooltipText && isHover && !isOpen &&
                <Overlay
                    key={id}
                    target={target.current as HTMLDivElement}
                    show={isHover}
                    placement={'top'}
                >
                    <StyledTooltip id={`tooltip-${id}`}>
                        <div>{tooltipText}</div>
                        {tooltipSubtext &&
                            <TooltipSubtext>
                                {tooltipSubtext}
                            </TooltipSubtext>
                        }
                        {shortcut &&
                            <Shortcut shortcut={shortcut}/>
                        }
                    </StyledTooltip>
                </Overlay>
            }
        </div>
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
    font-family: 'Open Sans',sans-serif;
    font-style: normal;
    font-weight: normal;
    font-size: 14px;
    color: var(--center-channel-color);
    padding: 8px 16px;
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

const TooltipSubtext = styled.div`
    opacity: 0.56;
`;

export default DotMenu;
