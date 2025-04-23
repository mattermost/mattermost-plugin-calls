// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function VideoOn(props: Props) {
    return (
        <svg
            style={props.style}
            className={props.className}
            fill={props.fill}
            viewBox='1.99 1.72 24.02 22.92'
            role='img'
        >
            <path
                d='M21.1999 12.0255L26.0095 7.24472V20.4351L18.8095 13.3503V7.84952H13.2799L10.8895 5.43032H18.8095C19.5967 5.43032 20.1919 5.64152 20.5951 6.06392C20.9983 6.46712 21.1999 7.06232 21.1999 7.84952V12.0255ZM1.9903 3.38552L3.6895 1.71512L24.9151 22.9695L23.2447 24.6399L20.3647 21.7599C20.0191 22.0863 19.5007 22.2495 18.8095 22.2495H4.4095C3.7375 22.2495 3.1615 22.0287 2.6815 21.5871C2.2207 21.1263 1.9903 20.5407 1.9903 19.8303V7.84952C1.9903 7.17752 2.1823 6.62072 2.5663 6.17912C2.9695 5.73752 3.4975 5.48792 4.1503 5.43032L1.9903 3.38552ZM4.4095 7.84952V19.8303H18.4351L6.4543 7.84952H4.4095Z'
            />
        </svg>
    );
}
