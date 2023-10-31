import React from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import {useIntl} from 'react-intl';

import {UserProfile} from '@mattermost/types/users';
import {Theme} from 'mattermost-redux/selectors/entities/preferences';
import ActiveCallIcon from 'src/components/icons/active_call_icon';
import {MAX_CHANNEL_LINK_TOOLTIP_NAMES} from 'src/constants';
import {getUserDisplayName, split} from 'src/utils';

interface Props {
    theme: Theme,
    hasCall: boolean,
    profiles: UserProfile[],
}

const ChannelLinkLabel = (props: Props) => {
    const {formatMessage, formatList} = useIntl();

    if (!props.hasCall) {
        return null;
    }

    const [showedProfiles, overflowedProfiles] = split(props.profiles, MAX_CHANNEL_LINK_TOOLTIP_NAMES);
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
