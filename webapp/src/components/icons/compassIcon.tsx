// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

type Props = {
    icon: string,
    className?: string,
} & React.HTMLAttributes<HTMLElement>

export default function CompassIcon({icon, className, ...rest}: Props): JSX.Element {
    // All compass icon classes start with icon,
    // so not expecting that prefix in props.
    return (
        <i
            className={`CompassIcon icon-${icon} ${className}`}
            {...rest}
        />
    );
}
