// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function PopOutIcon(props: Props) {
    return (
        <svg
            {...props}
            viewBox='0.1 0.61 10.8 10.8'
            role='img'
        >
            <path d='M6.6952 0.610049V1.80525H8.8552L2.9512 7.70925L3.8008 8.55885L9.7048 2.65485V4.81485H10.9V0.610049H6.6952ZM9.7048 10.2148H1.2952V1.80525H5.5V0.610049H1.2952C0.9688 0.610049 0.6856 0.725249 0.4456 0.955649C0.2152 1.18605 0.1 1.46925 0.1 1.80525V10.2148C0.1 10.5412 0.2152 10.8196 0.4456 11.05C0.6856 11.29 0.9688 11.41 1.2952 11.41H9.7048C10.0312 11.41 10.3096 11.29 10.54 11.05C10.78 10.8196 10.9 10.5412 10.9 10.2148V6.01005H9.7048V10.2148Z'/>
        </svg>
    );
}
