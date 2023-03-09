// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function ScreenIcon(props: Props) {
    return (
        <svg
            style={props.style}
            className={props.className}
            fill={props.fill}
            width='18px'
            height='17px'
            viewBox='0 0 18 17'
            role='img'
        >
            <path d='M15.75 11.5381H2.25V2.53809H15.75V11.5381ZM15.75 1.06152H2.25C1.82812 1.06152 1.46484 1.21387 1.16016 1.51855C0.878906 1.7998 0.738281 2.13965 0.738281 2.53809V11.5381C0.738281 11.96 0.878906 12.3232 1.16016 12.6279C1.46484 12.9092 1.82812 13.0498 2.25 13.0498H7.48828V14.5615H6.01172V16.0381H11.9883V14.5615H10.5117V13.0498H15.75C16.1719 13.0498 16.5234 12.9092 16.8047 12.6279C17.1094 12.3232 17.2617 11.96 17.2617 11.5381V2.53809C17.2617 2.13965 17.1094 1.7998 16.8047 1.51855C16.5234 1.21387 16.1719 1.06152 15.75 1.06152Z'/>
        </svg>
    );
}
