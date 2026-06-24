// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage} from 'react-intl';
import {useSelector} from 'react-redux';
import {callsAvailableInCurrentChannelWithDefault} from 'src/state/calls_availability/selectors';

export default function ChannelHeaderMenuItem() {
    const isEnabled = useSelector(callsAvailableInCurrentChannelWithDefault);

    if (isEnabled) {
        return (
            <FormattedMessage defaultMessage='Disable calls'/>
        );
    }

    return (
        <FormattedMessage defaultMessage='Enable calls'/>
    );
}
