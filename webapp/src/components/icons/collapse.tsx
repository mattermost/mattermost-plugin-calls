// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function CollapseIcon(props: Props) {
    return (
        <svg
            {...props}
            width='20px'
            height='20px'
            viewBox='0 0 20 20'
            role='img'
        >
            <path d='M17.512 1.09639L13 5.58439V2.00839H11.008V8.99239H17.992V7.00039H14.416L18.904 2.48839L17.512 1.09639ZM2.008 11.0084V13.0004H5.584L1.096 17.4884L2.512 18.9044L7 14.4164V17.9924H8.992V11.0084H2.008Z'/>
        </svg>
    );
}
