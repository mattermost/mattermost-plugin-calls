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
            width='7px'
            height='10px'
            viewBox='0 0 7 10'
            role='img'
        >
            <path
                d='M0.444 8.43805L3.882 5.00005L0.444 1.56205L1.506 0.500048L6.006 5.00005L1.506 9.50005L0.444 8.43805Z'
                fill='#3D3C40'
                fillOpacity='0.56'
            />
        </svg>
    );
}

