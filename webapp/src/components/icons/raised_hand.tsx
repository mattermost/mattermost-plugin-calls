// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function RaisedHandIcon(props: Props) {
    return (
        <svg
            {...props}
            width='24px'
            height='24px'
            viewBox='0 0 24 24'
            role='img'
        >
            <path
                d='M21,7c0-1.38-1.12-2.5-2.5-2.5c-0.17,0-0.34,0-0.5,0.05V4c0-1.38-1.12-2.5-2.5-2.5c-0.23,0-0.46,0.03-0.67,0.09
	C14.46,0.66,13.56,0,12.5,0c-1.23,0-2.25,0.89-2.46,2.06C9.87,2,9.69,2,9.5,2C8.12,2,7,3.12,7,4.5v5.89
	c-0.34-0.31-0.76-0.54-1.22-0.66L5,9.5c-0.82-0.21-1.69,0.11-2.18,0.85c-0.38,0.57-0.4,1.31-0.15,1.95l2.56,6.43
	C6.5,21.91,9.57,24,13,24c4.42,0,8-3.58,8-8V7 M19,16c0,3.31-2.69,6-6,6c-2.61,0-4.95-1.59-5.91-4L4.5,11.45L5,11.59
	c0.5,0.12,0.85,0.46,1,0.91L7,15h2V4.5C9,4.22,9.22,4,9.5,4S10,4.22,10,4.5V12h2V2.5C12,2.22,12.22,2,12.5,2S13,2.22,13,2.5V12h2V4
	c0-0.28,0.22-0.5,0.5-0.5S16,3.72,16,4v8h2V7c0-0.28,0.22-0.5,0.5-0.5S19,6.72,19,7V16z'
            />
        </svg>
    );
}

