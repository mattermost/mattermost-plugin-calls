// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

const DOT_COLUMNS = [4, 8, 12];
const DOT_ROWS = [2, 6, 10, 14];
const DOT_RADIUS = 1.5;

export default function DialpadIcon(props: Props) {
    return (
        <svg
            style={props.style}
            className={props.className}
            fill={props.fill}
            viewBox='0 0 16 16'
            role='img'
        >
            {DOT_ROWS.flatMap((cy) => DOT_COLUMNS.map((cx) => (
                <circle
                    key={`${cx}-${cy}`}
                    cx={cx}
                    cy={cy}
                    r={DOT_RADIUS}
                />
            )))}
        </svg>
    );
}
