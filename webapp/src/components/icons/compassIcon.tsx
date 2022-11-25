// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

interface Props {
    icon: string;
    className?: string;
    style?: CSSProperties;
}

export default function CompassIcon(props: Props): JSX.Element {
    // All compass icon classes start with icon,
    // so not expecting that prefix in props.
    return (
        <i
            className={`CompassIcon icon-${props.icon} ${props.className}`}
            style={props.style}
        />
    );
}
