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
            viewBox='0.51 0.96 14.34 14.34'
            role='img'
        >
            <path d='M1.56641 0.956299L14.8555 14.2454L13.8008 15.3L11.4102 12.9094C11.2695 13.0032 11.1289 13.05 10.9883 13.05H1.98828C1.77734 13.05 1.60156 12.9797 1.46094 12.8391C1.32031 12.6985 1.25 12.5227 1.25 12.3118V4.78833C1.25 4.57739 1.32031 4.40161 1.46094 4.26099C1.60156 4.12036 1.77734 4.05005 1.98828 4.05005H2.55078L0.511719 2.01099L1.56641 0.956299ZM2.76172 11.5383H10.0391L4.0625 5.56177H2.76172V11.5383ZM10.25 5.56177H8.28125L6.80469 4.05005H10.9883C11.1992 4.05005 11.375 4.12036 11.5156 4.26099C11.6797 4.40161 11.7617 4.57739 11.7617 4.78833V7.42505L14.75 4.43677V11.9954L10.25 7.49536V5.56177Z'/>
        </svg>
    );
}
