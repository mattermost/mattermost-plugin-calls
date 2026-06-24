// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import React from 'react';
import {FormattedMessage} from 'react-intl';
import {useSelector} from 'react-redux';
import {callsAvailableInCurrentChannelWithDefault} from 'src/state/call_availability/selectors';

export default function ChannelHeaderMenuItem() {
    const isEnabled = useSelector(callsAvailableInCurrentChannelWithDefault);

    const isAdmin = useSelector(isCurrentUserSystemAdmin);

    if (isEnabled || isAdmin) {
        return (
            <FormattedMessage defaultMessage='Disable calls'/>
        );
    }

    return (
        <FormattedMessage defaultMessage='Enable calls'/>
    );
}
