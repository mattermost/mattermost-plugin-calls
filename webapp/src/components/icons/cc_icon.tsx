// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function CCIcon({fill, style, className, ...rest}: Props) {
    return (
        <svg
            width='20'
            height='20'
            viewBox='2 3 20 18'
            xmlns='http://www.w3.org/2000/svg'
            role='img'
            className={className}
            style={style}
            fill={fill}
            {...rest}
        >
            <path d='M20,3H4C2.9,3,2,3.9,2,5v14c0,1.1,0.9,2,2,2h16c1.1,0,2-0.9,2-2V5C22,3.9,21.1,3,20,3z M20,19H4V5h16V19z M5.5,14.5v-5 	C5.5,8.7,6.2,8,7,8h2.8c0.8,0,1.5,0.7,1.5,1.5V11h-2v-1H7.5v4h1.8v-1h2v1.5c0,0.8-0.7,1.5-1.5,1.5H7C6.2,16,5.5,15.3,5.5,14.5z 	 M12.8,14.5v-5c0-0.8,0.7-1.5,1.5-1.5H17c0.8,0,1.5,0.7,1.5,1.5V11h-2v-1h-1.8v4h1.8v-1h2v1.5c0,0.8-0.7,1.5-1.5,1.5h-2.7 	C13.4,16,12.8,15.3,12.8,14.5z'/>
        </svg>
    );
}
