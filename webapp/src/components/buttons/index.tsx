// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import styled from 'styled-components';

export const Button = styled.button`
    display: flex;
    align-items: center;
    height: 40px;
    background: rgba(var(--center-channel-color-rgb), 0.08);
    color: rgba(var(--center-channel-color-rgb), 0.72);
    border-radius: 4px;
    border: 0;
    font-weight: 600;
    font-size: 14px;
    padding: 0 20px;
    position: relative;

    &:hover {
        background: rgba(var(--center-channel-color-rgb), 0.12);
    }

    &:disabled {
        color: rgba(var(--center-channel-color-rgb), 0.32);
        background: rgba(var(--center-channel-color-rgb), 0.08);
    }

    i {
        display: flex;
        font-size: 18px;
    }
`;

export const PrimaryButton = styled(Button)`
    background: var(--button-bg);
    color: var(--button-color);
    transition: background 0.15s ease-out;
    white-space: nowrap;

    &:active:not([disabled]) {
        background: rgba(var(--button-bg-rgb), 0.8);
    }

    &:before {
        content: '';
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        transition: all 0.15s ease-out;
        position: absolute;
        background: rgba(var(--center-channel-color-rgb), 0.16);
        opacity: 0;
        border-radius: 4px;
    }

    &:hover:enabled {
        background: var(--button-bg);

        &:before {
            opacity: 1;
        }
    }
`;

export const DestructiveButton = styled(Button)`
    background: var(--dnd-indicator);
    color: var(--button-color);

    &:hover {
        background: rgba(var(--dnd-indicator-rgb), 0.88)
    }

    &:disabled {
        background: rgba(var(--center-channel-color-rgb), 0.08);
    }
`;

export const TertiaryButton = styled(Button)`
    transition: all 0.15s ease-out;

    color: var(--button-bg);
    background: rgba(var(--button-bg-rgb), 0.08);

    &:disabled {
        color: rgba(var(--center-channel-color-rgb), 0.32);
        background: rgba(var(--center-channel-color-rgb), 0.08);
    }

    &:hover:enabled {
        background: rgba(var(--button-bg-rgb), 0.12);
    }

    &:active:enabled  {
        background: rgba(var(--button-bg-rgb), 0.16);
    }

    i {
        &:before {
            margin: 0 7px 0 0;
        }
    }
`;

