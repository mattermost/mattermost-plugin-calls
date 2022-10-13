// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';
import styled from 'styled-components';

type Props = {
    style?: CSSProperties,
}

const Icon = styled.i`
	font-size: 23px;
`;

export default function ShowMore(props: Props) {
    return (
        <Icon
            style={props.style}
            className={'CompassIcon icon-format-list-numbered LogoIcon'}
        />
    );
}

