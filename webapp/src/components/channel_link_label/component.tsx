import React from 'react';
import PropTypes from 'prop-types';

import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import {Channel} from '@mattermost/types/channels';
import {UserProfile} from '@mattermost/types/users';

import {getUserDisplayName, getUsersList} from '../../utils';

import ActiveCallIcon from '../../components/icons/active_call_icon';

interface Props {
    theme: any,
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
