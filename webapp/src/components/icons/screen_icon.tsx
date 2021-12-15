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
            height='16px'
            viewBox='0 0 18 16'
            role='img'
        >
            <path d='M15.75 10.5381H2.25V1.53809H15.75V10.5381ZM15.75 0.0615234H2.25C1.82812 0.0615234 1.46484 0.213867 1.16016 0.518555C0.878906 0.799805 0.738281 1.13965 0.738281 1.53809V10.5381C0.738281 10.96 0.878906 11.3232 1.16016 11.6279C1.46484 11.9092 1.82812 12.0498 2.25 12.0498H7.48828V13.5615H6.01172V15.0381H11.9883V13.5615H10.5117V12.0498H15.75C16.1719 12.0498 16.5234 11.9092 16.8047 11.6279C17.1094 11.3232 17.2617 10.96 17.2617 10.5381V1.53809C17.2617 1.13965 17.1094 0.799805 16.8047 0.518555C16.5234 0.213867 16.1719 0.0615234 15.75 0.0615234Z'/>
        </svg>
    );
}

