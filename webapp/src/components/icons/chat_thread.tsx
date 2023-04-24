// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function ChatThreadIcon(props: Props) {
    return (
        <svg
            style={props.style}
            fill={props.fill}
            viewBox='1.99 1.83 24.02 24.02'
            role='img'
        >
            <path d='M23.5904 1.83038C24.2624 1.83038 24.8288 2.07038 25.2896 2.55038C25.7696 3.01118 26.0096 3.57758 26.0096 4.24958V18.6496C26.0096 19.3216 25.7696 19.888 25.2896 20.3488C24.8288 20.8096 24.2624 21.04 23.5904 21.04H6.80002L1.99043 25.8496V4.24958C1.99043 3.57758 2.22083 3.01118 2.68163 2.55038C3.16163 2.07038 3.73763 1.83038 4.40963 1.83038H23.5904ZM4.40963 4.24958V20.032L5.79203 18.6496H23.5904V4.24958H4.40963ZM6.80002 7.84958H21.2V10.24H6.80002V7.84958ZM6.80002 12.6304H17.6V15.0496H6.80002V12.6304Z'/>
        </svg>
    );
}

