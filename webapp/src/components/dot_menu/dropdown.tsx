// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    autoUpdate,
    flip,
    FloatingFocusManager, FloatingPortal,
    offset,
    Placement,
    shift,
    Strategy,
    useDismiss,
    useFloating,
    useInteractions,
    useRole,
} from '@floating-ui/react';
import React, {cloneElement, ComponentProps, useState} from 'react';
import styled from 'styled-components';

const FloatingContainer = styled.div`
    min-width: 16rem;
    z-index: 10002;
`;

type DropdownProps = {
    target: JSX.Element;
    children: React.ReactNode;
    placement?: Placement;
    offset?: Parameters<typeof offset>[0];
    flip?: Parameters<typeof flip>[0];
    shift?: Parameters<typeof shift>[0];
    focusManager?: boolean | Omit<ComponentProps<typeof FloatingFocusManager>, 'context' | 'children'>;
    portal?: boolean;
    strategy?: Strategy;
    isOpen: boolean;
    onOpenChange?: ((open: boolean) => void);
};

const Dropdown = (props: DropdownProps) => {
    const [isOpen, setIsOpen] = useState(props.isOpen);

    const open = props.isOpen ?? isOpen;

    const setOpen = (updatedOpen: boolean) => {
        props.onOpenChange?.(updatedOpen);
        setIsOpen(updatedOpen);
    };

    const {strategy, x, y, refs, context} = useFloating({
        open,
        onOpenChange: setOpen,
        placement: props.placement ?? 'bottom-start',
        strategy: props.strategy ?? 'absolute',
        middleware: [offset(props.offset ?? 2), flip(props.flip), shift(props.shift ?? {padding: 2})],
        whileElementsMounted: autoUpdate,
    });

    const {getReferenceProps, getFloatingProps} = useInteractions([
        useRole(context),
        useDismiss(context),
    ]);

    let content = (
        <FloatingContainer
            {...getFloatingProps({
                ref: refs.setFloating,
                style: {

                    // @ts-ignore
                    appRegion: 'no-drag',
                    position: strategy,
                    top: y ?? 0,
                    left: x ?? 0,
                },
            })}
        >
            {props.children}
        </FloatingContainer>
    );

    if (props.focusManager ?? true) {
        content = (
            <FloatingFocusManager
                {...typeof props.focusManager === 'boolean' ? false : props.focusManager}
                context={context}
            >
                {content}
            </FloatingFocusManager>
        );
    }

    if (props.portal) {
        content = (
            <FloatingPortal>
                {content}
            </FloatingPortal>
        );
    }

    return (
        <>
            {cloneElement(props.target, getReferenceProps({ref: refs.setReference, ...props.target.props}))}
            {open && content}
        </>
    );
};

export default Dropdown;
