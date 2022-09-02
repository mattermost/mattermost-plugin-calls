// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage} from 'react-intl';

interface Props {
    enabled: boolean,
}

const ChannelHeaderMenuButton = (props: Props) => {
    if (props.enabled) {
        return (
            <FormattedMessage defaultMessage='Disable Calls'/>
        );
    }
    return (
        <FormattedMessage defaultMessage='Enable Calls'/>
    );
};

export default ChannelHeaderMenuButton;
