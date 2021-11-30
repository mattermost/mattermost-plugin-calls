import React from 'react';
import PropTypes from 'prop-types';

import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import {Channel} from 'mattermost-redux/types/channels';
import {UserProfile} from 'mattermost-redux/types/users';

import {getUserDisplayName} from '../../utils';

import ActiveCallIcon from '../../components/icons/active_call_icon';

interface Props {
    hasCall: boolean,
    profiles: UserProfile[],
}

const getUsersList = (profiles: UserProfile[]) => {
    if (profiles.length === 0) {
        return '';
    }
    if (profiles.length === 1) {
        return getUserDisplayName(profiles[0]);
    }
    const list = profiles.slice(0, -1).map((profile, idx) => {
        return getUserDisplayName(profile);
    }).join(', ');
    return list + ' and ' + getUserDisplayName(profiles[profiles.length - 1]);
};

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
                    fill='#FFFFFF'
                    style={{marginLeft: 'auto', height: 'auto'}}
                />

            </OverlayTrigger>
        );
    }

    return null;
};

export default ChannelLinkLabel;
