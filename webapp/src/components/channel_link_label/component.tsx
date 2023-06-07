import React from 'react';
import {useIntl} from 'react-intl';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import {UserProfile} from '@mattermost/types/users';
import {Theme} from 'mattermost-redux/types/themes';

import {getUserDisplayName, split} from 'src/utils';
import ActiveCallIcon from 'src/components/icons/active_call_icon';

interface Props {
    theme: Theme,
    hasCall: boolean,
    profiles: UserProfile[],
}

const CHANNEL_TOOLTIP_LIMIT = 10;

const ChannelLinkLabel = (props: Props) => {
    const {formatMessage, formatList} = useIntl();

    if (!props.hasCall) {
        return null;
    }

    const [showedProfiles, overflowedProfiles] = split(props.profiles, CHANNEL_TOOLTIP_LIMIT);
    const userList = showedProfiles.map((user) => getUserDisplayName(user));

    if (overflowedProfiles) {
        userList.push(formatMessage({defaultMessage: '{num, plural, one {# other} other {# others}}'}, {num: overflowedProfiles.length}));
    }

    return (
        <OverlayTrigger
            placement='top'
            overlay={
                <Tooltip
                    id='call-profiles'
                >
                    {formatMessage({defaultMessage: '{list} {count, plural, =1 {is} other {are}} on the call'}, {
                        count: props.profiles.length,
                        list: formatList(userList),
                    })}
                </Tooltip>
            }
        >
            <ActiveCallIcon
                fill={props.theme.sidebarText}
                style={{marginLeft: 'auto', height: 'auto'}}
            />
        </OverlayTrigger>
    );
};

export default ChannelLinkLabel;
