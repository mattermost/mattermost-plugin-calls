import React from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import {UserProfile} from '@mattermost/types/users';
import {Theme} from 'mattermost-redux/types/themes';

import {getUsersList} from 'src/utils';
import ActiveCallIcon from 'src/components/icons/active_call_icon';

interface Props {
    theme: Theme,
    hasCall: boolean,
    profiles: UserProfile[],
}

const ChannelLinkLabel = (props: Props) => {
    if (props.hasCall) {
        return (
            <OverlayTrigger
                placement='top'
                overlay={
                    <Tooltip
                        id='call-profiles'
                    >
                        {getUsersList(props.profiles) + (props.profiles.length > 1 ? ' are' : ' is') + ' on the call'}
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
