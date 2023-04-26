// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function ExpandIcon(props: Props) {
    return (
        <svg
            {...props}
            width='16px'
            height='16px'
            viewBox='0 0 16 16'
            role='img'
        >
            <path d='M6.48828 15.2998V13.7881H3.81641L7.19141 10.4131L6.13672 9.3584L2.76172 12.7334V10.0615H1.25V15.2998H6.48828ZM9.86328 7.74121L13.2383 4.36621V7.03809H14.75V1.7998H9.51172V3.31152H12.1836L8.80859 6.68652L9.86328 7.74121Z'/>
        </svg>
    );
}
