import React from 'react';
import {useIntl} from 'react-intl';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import {UserProfile} from '@mattermost/types/users';
import {Theme} from 'mattermost-redux/types/themes';

import {getUserDisplayName} from 'src/utils';
import ActiveCallIcon from 'src/components/icons/active_call_icon';

interface Props {
    theme: Theme,
    hasCall: boolean,
    profiles: UserProfile[],
}

const ChannelLinkLabel = (props: Props) => {
    const {formatMessage, formatList} = useIntl();

    if (props.hasCall) {
        return (
            <OverlayTrigger
                placement='top'
                overlay={
                    <Tooltip
                        id='call-profiles'
                    >
                        {formatMessage({defaultMessage: '{list} {count, plural, =1 {is} other {are}} on the call'}, {
                            count: props.profiles.length,
                            list: formatList(props.profiles.map((user) => getUserDisplayName(user)), {type: 'conjunction'})
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
    }

    return null;
};

export default ChannelLinkLabel;
