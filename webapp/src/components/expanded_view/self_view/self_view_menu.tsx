// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {autoUpdate, flip, FloatingPortal, offset, shift, useFloating} from '@floating-ui/react';
import CheckIcon from '@mattermost/compass-icons/components/check';
import ChevronRightIcon from '@mattermost/compass-icons/components/chevron-right';
import DotsHorizontalIcon from '@mattermost/compass-icons/components/dots-horizontal';
import EyeOffOutlineIcon from '@mattermost/compass-icons/components/eye-off-outline';
import {Icon} from '@mattermost/compass-ui/components/icon';
import {IconButton} from '@mattermost/compass-ui/components/icon-button';
import {MenuItem} from '@mattermost/compass-ui/components/menu-item';
import {PopoverMenu} from '@mattermost/compass-ui/components/popover-menu';
import React, {useCallback, useEffect, useId, useRef, useState} from 'react';
import {defineMessage, MessageDescriptor, useIntl} from 'react-intl';
import type {SelfViewCorner} from 'src/types/types';

import {SELF_VIEW_CORNERS} from './self_view_position';

const CORNER_LABELS: Record<SelfViewCorner, MessageDescriptor> = {
    'top-left': defineMessage({defaultMessage: 'Top left'}),
    'top-right': defineMessage({defaultMessage: 'Top right'}),
    'bottom-left': defineMessage({defaultMessage: 'Bottom left'}),
    'bottom-right': defineMessage({defaultMessage: 'Bottom right'}),
};

type Props = {
    corner: SelfViewCorner;
    onMove: (corner: SelfViewCorner) => void;
    onHide: () => void;
};

const focusItem = (menu: HTMLElement | null, index: number | 'first' | 'last') => {
    const items = Array.from(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"]') ?? []);
    if (items.length === 0) {
        return;
    }
    let target = index;
    if (target === 'first') {
        target = 0;
    } else if (target === 'last') {
        target = items.length - 1;
    }
    items[(target + items.length) % items.length].focus();
};

const focusSibling = (menu: HTMLElement | null, step: number) => {
    const items = Array.from(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"]') ?? []);
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    focusItem(menu, current + step);
};

// Arrow keys, Home and End move between items; the caller handles the keys that open or close.
const navigateMenu = (e: React.KeyboardEvent, menu: HTMLElement | null) => {
    const moves: Record<string, () => void> = {
        ArrowDown: () => focusSibling(menu, 1),
        ArrowUp: () => focusSibling(menu, -1),
        Home: () => focusItem(menu, 'first'),
        End: () => focusItem(menu, 'last'),
    };
    if (Object.hasOwn(moves, e.key)) {
        e.preventDefault();
        moves[e.key]();
        return true;
    }
    return false;
};

export default function SelfViewMenu({corner, onMove, onHide}: Props) {
    const {formatMessage} = useIntl();
    const [open, setOpen] = useState(false);
    const [submenuOpen, setSubmenuOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const submenuRef = useRef<HTMLDivElement | null>(null);
    const moveItemRef = useRef<HTMLButtonElement | null>(null);
    const menuID = useId();
    const submenuID = useId();

    const menu = useFloating({
        open,
        placement: 'top-end',
        strategy: 'fixed',
        middleware: [offset(4), flip(), shift({padding: 8})],
        whileElementsMounted: autoUpdate,
    });
    const submenu = useFloating({
        open: submenuOpen,
        placement: 'left-start',
        strategy: 'fixed',
        middleware: [offset(4), flip(), shift({padding: 8})],
        whileElementsMounted: autoUpdate,
    });

    const close = (returnFocus: boolean) => {
        setSubmenuOpen(false);
        setOpen(false);
        if (returnFocus) {
            buttonRef.current?.focus();
        }
    };

    const closeRef = useRef(close);
    closeRef.current = close;

    // The portal mounts its content after the first render, so focus waits for the menu element.
    const [menuElement, setMenuElement] = useState<HTMLDivElement | null>(null);
    const [submenuElement, setSubmenuElement] = useState<HTMLDivElement | null>(null);
    const {setFloating: setMenuFloating} = menu.refs;
    const {setFloating: setSubmenuFloating} = submenu.refs;

    const setMenuRef = useCallback((el: HTMLDivElement | null) => {
        menuRef.current = el;
        setMenuFloating(el);
        setMenuElement(el);
    }, [setMenuFloating]);

    const setSubmenuRef = useCallback((el: HTMLDivElement | null) => {
        submenuRef.current = el;
        setSubmenuFloating(el);
        setSubmenuElement(el);
    }, [setSubmenuFloating]);

    const cornerRef = useRef(corner);
    cornerRef.current = corner;

    useEffect(() => {
        focusItem(menuElement, 'first');
    }, [menuElement]);

    useEffect(() => {
        focusItem(submenuElement, SELF_VIEW_CORNERS.indexOf(cornerRef.current));
    }, [submenuElement]);

    useEffect(() => {
        if (!open) {
            return undefined;
        }
        const onOutside = (e: MouseEvent) => {
            const inside = [buttonRef.current, menuRef.current, submenuRef.current].some((el) => el && e.target instanceof Node && el.contains(e.target));
            if (!inside) {
                closeRef.current(false);
            }
        };
        document.addEventListener('mousedown', onOutside, true);
        return () => document.removeEventListener('mousedown', onOutside, true);
    }, [open]);

    const openSubmenu = () => setSubmenuOpen(true);

    const closeSubmenu = () => {
        setSubmenuOpen(false);
        moveItemRef.current?.focus();
    };

    const onMenuKeyDown = (e: React.KeyboardEvent) => {
        if (navigateMenu(e, menuRef.current)) {
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close(true);
        } else if (e.key === 'Tab') {
            close(false);
        } else if (e.key === 'ArrowRight' && document.activeElement === moveItemRef.current) {
            e.preventDefault();
            openSubmenu();
        }
    };

    const onSubmenuKeyDown = (e: React.KeyboardEvent) => {
        e.stopPropagation();
        if (navigateMenu(e, submenuRef.current)) {
            return;
        }
        if (e.key === 'Escape' || e.key === 'ArrowLeft') {
            e.preventDefault();
            closeSubmenu();
        } else if (e.key === 'Tab') {
            close(false);
        }
    };

    const optionsLabel = formatMessage({defaultMessage: 'Self view options'});
    const moveLabel = formatMessage({defaultMessage: 'Move self view'});

    return (
        <>
            <IconButton
                ref={(el: HTMLButtonElement | null) => {
                    buttonRef.current = el;
                    menu.refs.setReference(el);
                }}
                className='SelfView__menuButton'
                icon={<Icon glyph={<DotsHorizontalIcon/>}/>}
                size='x-small'
                // eslint-disable-next-line react/style-prop-object
                style='inverted'
                rounded={true}
                aria-label={optionsLabel}
                aria-haspopup='menu'
                aria-expanded={open}
                aria-controls={open ? menuID : undefined}
                onClick={() => (open ? close(false) : setOpen(true))}
            />
            {open &&
                <FloatingPortal>
                    <div
                        ref={setMenuRef}
                        className='SelfView__menu'
                        style={menu.floatingStyles}
                    >
                        <PopoverMenu
                            id={menuID}
                            role='menu'
                            aria-label={optionsLabel}
                            onKeyDown={onMenuKeyDown}
                        >
                            <MenuItem
                                role='menuitem'
                                label={formatMessage({defaultMessage: 'Hide self view'})}
                                leadingVisual={<Icon glyph={<EyeOffOutlineIcon/>}/>}
                                onClick={() => {
                                    close(false);
                                    onHide();
                                }}
                            />
                            <MenuItem
                                ref={(el: HTMLButtonElement | null) => {
                                    moveItemRef.current = el;
                                    submenu.refs.setReference(el);
                                }}
                                role='menuitem'
                                label={moveLabel}
                                leadingElement={false}
                                trailingElement={true}
                                trailingVisual={<Icon glyph={<ChevronRightIcon/>}/>}
                                active={submenuOpen}
                                aria-haspopup='menu'
                                aria-expanded={submenuOpen}
                                aria-controls={submenuOpen ? submenuID : undefined}
                                onClick={openSubmenu}
                            />
                        </PopoverMenu>
                    </div>
                    {submenuOpen &&
                        <div
                            ref={setSubmenuRef}
                            className='SelfView__menu'
                            style={submenu.floatingStyles}
                        >
                            <PopoverMenu
                                id={submenuID}
                                variant='child'
                                role='menu'
                                aria-label={moveLabel}
                                onKeyDown={onSubmenuKeyDown}
                            >
                                {SELF_VIEW_CORNERS.map((option) => (
                                    <MenuItem
                                        key={option}
                                        role='menuitemradio'
                                        aria-checked={option === corner}
                                        label={formatMessage(CORNER_LABELS[option])}
                                        leadingElement={false}
                                        trailingElement={option === corner}
                                        trailingVisual={<Icon glyph={<CheckIcon/>}/>}
                                        onClick={() => {
                                            close(true);
                                            onMove(option);
                                        }}
                                    />
                                ))}
                            </PopoverMenu>
                        </div>
                    }
                </FloatingPortal>
            }
        </>
    );
}
