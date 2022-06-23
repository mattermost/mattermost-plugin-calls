// Copyright (c) 2017-present Mattermost, Inc. All Rights Reserved.
// See License for license information.

import React from 'react';

import styled from 'styled-components';

const DotMenuIcon = (props: React.PropsWithoutRef<JSX.IntrinsicElements['i']>): JSX.Element => (
    <i className={`icon icon-dots-horizontal icon-16 ${props.className}`}/>
);

export default styled(DotMenuIcon)`
    color: rgba(var(--center-channel-color-rgb), 0.56);
    position: relative;
`;
