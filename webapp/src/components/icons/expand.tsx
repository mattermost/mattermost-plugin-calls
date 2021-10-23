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
            width='14px'
            height='15px'
            viewBox='0 0 14 15'
            role='img'
        >
            <path
                d='M5.48828 14.3V12.7883H2.81641L6.19141 9.41333L5.13672 8.35864L1.76172 11.7336V9.06177H0.25V14.3H5.48828ZM8.86328 6.74146L12.2383 3.36646V6.03833H13.75V0.800049H8.51172V2.31177H11.1836L7.80859 5.68677L8.86328 6.74146Z'
            />
        </svg>
    );
}
