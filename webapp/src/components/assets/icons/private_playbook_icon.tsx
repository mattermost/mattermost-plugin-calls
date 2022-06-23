// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See License for license information.

import React from 'react';
import styled from 'styled-components';

import Icon from 'src/components/assets/svg';

const Svg = styled(Icon)`
    width: 14px;
    height: 15px;
`;

const PrivatePlaybookIcon = (props: {className?: string}) => (
    <Svg
        className={props.className}
        viewBox='0 0 14 15'
        fill='none'
        xmlns='http://www.w3.org/2000/svg'
    >
        <path
            d='M6.63158 14.025C6.63158 14.37 6.70526 14.7 6.83053 15H1.47368C0.655789 15 0 14.3325 0 13.5V1.5C0 0.675 0.655789 0 1.47368 0H10.3158C11.1337 0 11.7895 0.675 11.7895 1.5V6.0825C11.5537 6.03 11.3032 6 11.0526 6C10.8021 6 10.5516 6.03 10.3158 6.0825V1.5H6.63158V7.5L4.78947 5.8125L2.94737 7.5V1.5H1.47368V13.5H6.63158V14.025ZM14 11.475V14.1C14 14.55 13.5579 15 13.0421 15H8.98947C8.54737 15 8.10526 14.55 8.10526 14.025V11.4C8.10526 10.95 8.54737 10.5 8.98947 10.5V9.375C8.98947 8.325 10.0211 7.5 11.0526 7.5C12.0842 7.5 13.1158 8.325 13.1158 9.375V10.5C13.5579 10.5 14 10.95 14 11.475ZM12.1579 9.375C12.1579 8.775 11.6421 8.4 11.0526 8.4C10.4632 8.4 9.94737 8.775 9.94737 9.375V10.5H12.1579V9.375Z'
            fill='currentColor'
        />
    </Svg>
);

export default PrivatePlaybookIcon;
