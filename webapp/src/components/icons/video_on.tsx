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
            viewBox='0 0.4 18 12'
            role='img'
        >
            <path d='M12 2.41553H2.01562V10.3843H12V2.41553ZM12.9844 0.399902C13.2656 0.399902 13.5 0.493652 13.6875 0.681152C13.9062 0.868652 14.0156 1.10303 14.0156 1.38428V4.8999L18 0.915527V11.8843L14.0156 7.8999V11.4155C14.0156 11.6968 13.9062 11.9312 13.6875 12.1187C13.5 12.3062 13.2656 12.3999 12.9844 12.3999H0.984375C0.703125 12.3999 0.46875 12.3062 0.28125 12.1187C0.09375 11.9312 0 11.6968 0 11.4155V1.38428C0 1.10303 0.09375 0.868652 0.28125 0.681152C0.46875 0.493652 0.703125 0.399902 0.984375 0.399902H12.9844Z'/>
        </svg>
    );
}
