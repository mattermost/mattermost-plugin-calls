// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    stroke?: string,
    strokeWidth?: number,
    style?: CSSProperties,
}

const MutedIcon: React.FC<Props> = (props: Props) => (
    <svg
        style={props.style}
        className={props.className}
        fill={props.fill || 'currentColor'}
        width='14px'
        height='15px'
        viewBox='0 0 14 15'
        role='img'
    >
        <path d='M12.2383 6.81177C12.2383 7.65552 12.0156 8.47583 11.5703 9.27271L10.6562 8.32349C10.8672 7.8313 10.9727 7.32739 10.9727 6.81177H12.2383ZM9.25 6.91724L4.75 2.45239V2.31177C4.75 1.67896 4.96094 1.15161 5.38281 0.729736C5.82812 0.284424 6.36719 0.0617676 7 0.0617676C7.63281 0.0617676 8.16016 0.284424 8.58203 0.729736C9.02734 1.15161 9.25 1.67896 9.25 2.31177V6.91724ZM1.19922 0.800049L13.75 13.3508L12.8008 14.3L9.67188 11.1711C9.08594 11.5227 8.44141 11.7454 7.73828 11.8391V14.3H6.26172V11.8391C5.44141 11.7219 4.67969 11.429 3.97656 10.9602C3.29688 10.468 2.75781 9.85864 2.35938 9.13208C1.96094 8.40552 1.76172 7.63208 1.76172 6.81177H3.02734C3.02734 7.53833 3.20312 8.19458 3.55469 8.78052C3.92969 9.34302 4.42188 9.78833 5.03125 10.1165C5.66406 10.4446 6.32031 10.6086 7 10.6086C7.58594 10.6086 8.16016 10.4797 8.72266 10.2219L7.49219 8.99146L7 9.06177C6.36719 9.06177 5.82812 8.83911 5.38281 8.3938C4.96094 7.94849 4.75 7.42114 4.75 6.81177V6.24927L0.25 1.74927L1.19922 0.800049Z'/>
        <line
            x1='0.730525'
            y1='1.26972'
            x2='13.2661'
            y2='13.8053'
            stroke={props.stroke || 'var(--dnd-indicator)'}
            strokeWidth={props.strokeWidth || 1.5}
        />
    </svg>
);

export default MutedIcon;

