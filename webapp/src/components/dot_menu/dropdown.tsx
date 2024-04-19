// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Strategy} from '@floating-ui/react';
import {
    autoUpdate,
    flip,
    FloatingFocusManager,
    offset,
    Placement,
    shift,
    useDismiss,
    useFloating,
    useInteractions,
    useRole,
} from '@floating-ui/react-dom-interactions';
import React, {cloneElement, ComponentProps, useState} from 'react';
import styled from 'styled-components';

const FloatingContainer = styled.div`
    min-width: 16rem;
    z-index: 50;
`;

type DropdownProps = {
    target: JSX.Element;
    children: React.ReactNode;
    placement?: Placement;
    offset?: Parameters<typeof offset>[0];
    flip?: Parameters<typeof flip>[0];
    shift?: Parameters<typeof shift>[0];
    focusManager?: boolean | Omit<ComponentProps<typeof FloatingFocusManager>, 'context' | 'children'>;
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

    const {strategy, x, y, reference, floating, context} = useFloating({
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
                ref: floating,
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

    return (
        <>
            {cloneElement(props.target, getReferenceProps({ref: reference, ...props.target.props}))}
            {open && content}
        </>
    );
};

export default Dropdown;
