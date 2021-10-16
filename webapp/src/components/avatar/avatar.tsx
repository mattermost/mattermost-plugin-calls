// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {memo, HTMLAttributes} from 'react';
import classNames from 'classnames';

import CompassIcon from '../../components/icons/compassIcon';

import './avatar.scss';

export type TAvatarSizeToken = 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

type Props = {
    url?: string;
    username?: string;
    size?: TAvatarSizeToken;
    text?: string;
    icon?: string;
};

type Attrs = HTMLAttributes<HTMLElement>;

const Avatar = ({
    url,
    username,
    size = 'md',
    text,
    icon,
    ...attrs
}: Props & Attrs) => {
    const classes = classNames(`Avatar Avatar-${size}`, attrs.className);

    if (text) {
        return (
            <div
                {...attrs}
                className={classes + ' Avatar-plain'}
                data-content={text}
            />
        );
    }

    if (icon) {
        return (

            <div
                {...attrs}
                className={classes + ' Avatar-plain'}
            >
                <CompassIcon icon={icon}/>
            </div>
        );
    }

    return (
        <img
            {...attrs}
            className={classes}
            alt={`${username || 'user'} profile image`}
            src={url}
        />
    );
};
export default memo(Avatar);
