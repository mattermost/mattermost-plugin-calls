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
            viewBox='1.99 5.43 24.02 16.82'
            role='img'
        >
            <path d='M21.2004 12.0255L26.01 7.24472V20.4351L21.2004 15.6255V19.8303C21.2004 20.5599 20.9892 21.1455 20.5668 21.5871C20.1636 22.0287 19.578 22.2495 18.81 22.2495H4.40999C3.73799 22.2495 3.16199 22.0287 2.68199 21.5871C2.22119 21.1263 1.99079 20.5407 1.99079 19.8303V7.84952C1.99079 7.11992 2.21159 6.53432 2.65319 6.09272C3.11399 5.65112 3.69959 5.43032 4.40999 5.43032H18.81C19.5972 5.43032 20.1924 5.64152 20.5956 6.06392C20.9988 6.46712 21.2004 7.06232 21.2004 7.84952V12.0255ZM18.81 19.8303V7.84952H4.40999V19.8303H18.81Z'/>
        </svg>
    );
}
