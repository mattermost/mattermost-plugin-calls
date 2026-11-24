// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function VideoOffOutlineIcon(props: Props) {
    return (
        <svg
            {...props}
            fill={props.fill || 'currentColor'}
            viewBox='2 1.9 20 19.1'
            role='img'
        >
            <path d='M18 10.5V7.00002C18 5.70002 17.3 5.00002 16 5.00002H9.4L11.4 7.00002H16V11.6L22 17.5V6.50002L18 10.5ZM2 3.30002L3.8 5.00002C2.7 5.10002 2 5.90002 2 7.00002V17C2 18.2 2.9 19 4 19H16C16.5 19 17 18.9 17.3 18.6L19.7 21L21.1 19.6L3.4 1.90002L2 3.30002ZM4 7.00002H5.7L15.7 17H4V7.00002Z'/>
        </svg>
    );
}
