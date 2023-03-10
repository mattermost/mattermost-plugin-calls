// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function ShowMore(props: Props) {
    return (
        <svg
            {...props}
            width='16px'
            height='16px'
            viewBox='0 0 16 16'
            role='img'
        >
            <path d='M5.444 11.4378L8.882 7.9998L5.444 4.5618L6.506 3.4998L11.006 7.9998L6.506 12.4998L5.444 11.4378Z'/>
        </svg>
    );
}
