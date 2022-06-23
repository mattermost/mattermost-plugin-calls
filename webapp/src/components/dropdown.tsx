// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import styled, {css} from 'styled-components';

const ProfileDropdown = styled.div`
    position: relative;
`;

const Blanket = styled.div`
    bottom: 0;
    left: 0;
    top: 0;
    right: 0;
    position: fixed;
    z-index: 1;
`;

interface ChildContainerProps {
    moveUp?: number;
    showOnRight?: boolean;
}

const ChildContainer = styled.div<ChildContainerProps>`
    margin: 4px 0 0;
    min-width: 20rem;
	z-index: 50;
	position: absolute;
    top: ${(props) => 27 - (props.moveUp || 0)}px;
    ${(props) => props.showOnRight && css`
        right: -55px;
    `}
	.PlaybookRunProfileButton {
		.Profile {
			background-color: var(--button-bg-08);
		}
	}
    .playbook-run-user-select__menu-list {
        padding: 0 0 12px;
        border: none;
    }
    .playbook-run-user-select {
        border-radius: 4px;
        -webkit-overflow-scrolling: touch;
        background-color: var(--center-channel-bg);
        border: 1px solid var(--center-channel-color-16);
        max-height: 100%;
        max-width: 340px;
        overflow: hidden;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    }
`;

interface DropdownProps {
    children: JSX.Element;
    isOpen: boolean;
    showOnRight?: boolean;
    moveUp?: number;
    target: JSX.Element;
    onClose: () => void;
}

const Dropdown = ({children, isOpen, showOnRight, moveUp, target, onClose}: DropdownProps) => {
    if (!isOpen) {
        return target;
    }

    return (
        <ProfileDropdown>
            {target}
            <ChildContainer
                moveUp={moveUp}
                showOnRight={showOnRight}
            >
                {children}
            </ChildContainer>
            <Blanket onClick={onClose}/>
        </ProfileDropdown>
    );
};

export default Dropdown;
