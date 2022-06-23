// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import classNames from 'classnames';

interface SpinnerProps {
    className?: string
}

const Spinner = (props: SpinnerProps) => (
    <i className={classNames('fa fa-pulse fa-spinner', props.className)}/>
);

export default Spinner;
