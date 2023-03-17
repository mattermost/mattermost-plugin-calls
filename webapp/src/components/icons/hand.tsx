// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function HandIcon(props: Props) {
    return (
        <svg
            {...props}
            width='24px'
            height='24px'
            viewBox='0 0 24 24'
            role='img'
        >
            <path
                d='M13.042,22c-2.717,0-5.158-1.667-6.167-4.167l-2.524-6.358c-0.258-0.658,0.358-1.317,1.033-1.1l0.658,0.217
	c0.467,0.158,0.85,0.508,1.034,0.966L8.251,14.5h0.625V4.708c0-0.575,0.467-1.042,1.042-1.042s1.042,0.467,1.042,1.042V12h0.833
	V3.042C11.792,2.467,12.259,2,12.834,2s1.042,0.467,1.042,1.042V12h0.833V4.292c0-0.575,0.467-1.042,1.042-1.042
	s1.042,0.467,1.042,1.042V12h0.833V6.792c0-0.575,0.467-1.042,1.042-1.042s1.042,0.467,1.042,1.042v8.542
	C19.709,19.017,16.726,22,13.042,22z'
            />
        </svg>
    );
}

