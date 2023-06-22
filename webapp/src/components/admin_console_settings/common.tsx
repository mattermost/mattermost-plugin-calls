// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import styled from 'styled-components';

import GenericModal from 'src/components/generic_modal';

export const leftCol = 'col-sm-4';
export const rightCol = 'col-sm-8';

export const LabelRow = styled.div`
    display: flex;
`;

export const UpgradePill = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    padding: 3px 8px 3px 22px;
    margin-left: 8px;
    background: var(--button-bg);
    border-radius: 10px;
    height: 20px;

    font-size: 10px;
    font-weight: 600;
    line-height: 15px;
    color: var(--center-channel-bg);

    &:before {
        left: 7px;
        top: 3px;
        position: absolute;
        content: '\f030b';
        font-size: 12px;
        font-family: 'compass-icons', mattermosticons;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
    }
`;

export const EnterprisePill = styled(UpgradePill)`
    background: rgba(var(--button-bg-rgb), 0.16);
    color: var(--button-bg);

    &:before {
        content: '\f140c';
    }
`;

export const LeftBox = styled.div`
    display: flex;
    flex-direction: column;
    padding: 24px;
    max-width: 584px;
    background: var(--center-channel-bg);
    box-shadow: 0 2px 3px rgba(0, 0, 0, 0.08);
    border-radius: 4px;
`;

export const Title = styled.div`
    font-family: 'Metropolis', sans-serif;
    font-weight: 600;
    font-size: 16px;
    line-height: 24px;
    color: var(--center-channel-text);
`;

export const Text = styled.div`
    font-family: 'Open Sans', sans-serif;
    font-weight: 400;
    font-size: 12px;
    line-height: 16px;
    color: var(--center-channel-text);
`;

export const Footer = styled.div`
    display: flex;
`;

export const FooterText = styled.div`
    font-family: 'Open Sans', sans-serif;
    font-weight: 400;
    font-size: 10px;
    line-height: 16px;
    color: rgba(var(--center-channel-text-rgb), 0.72);
`;

export const ModalTitle = styled.div`
    font-family: 'Metropolis', sans-serif;
    font-style: normal;
    font-weight: 600;
    font-size: 22px;
    line-height: 28px;
    text-align: center;
`;

export const ModalBody = styled.div`
    font-family: 'Open Sans', sans-serif;
    font-style: normal;
    font-weight: 400;
    font-size: 14px;
    line-height: 20px;
`;

export const ModalFooterContainer = styled.div`
    display: flex;
    justify-content: center;
`;

export const StyledModal = styled(GenericModal)`
    text-align: center;
`;
