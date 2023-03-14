// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function UnshareScreenIcon(props: Props) {
    return (
        <svg
            style={props.style}
            className={props.className}
            fill={props.fill}
            width='29px'
            height='28px'
            viewBox='0 0 29 28'
            role='img'
        >
            <path d='M17.3904 21.04V23.4304H19.8096V25.8496H10.1904V23.4304H12.6096V21.04H4.19999C3.54719 21.04 2.98079 20.8096 2.50079 20.3488C2.03999 19.8688 1.80959 19.3024 1.80959 18.6496V4.24958L0.599995 3.03998L2.29919 1.34078L27.1824 26.2528L25.512 27.952L18.6 21.04H17.3904ZM4.19999 18.6496H16.2096L4.19999 6.63998V18.6496ZM25.8 1.83038C26.4528 1.83038 27.0096 2.07038 27.4704 2.55038C27.9504 3.01118 28.1904 3.57758 28.1904 4.24958V18.6496C28.1904 19.3024 27.96 19.8688 27.4992 20.3488C27.0384 20.8096 26.472 21.04 25.8 21.04H25.3968L23.0064 18.6496H25.8V4.24958H8.6064L6.18719 1.83038H25.8Z'/>
        </svg>
    );
}
