import {UserProfile} from '@mattermost/types/users';
import {Theme} from 'mattermost-redux/selectors/entities/preferences';
import React from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import {useIntl} from 'react-intl';
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

            <span
                data-testid={'calls-sidebar-active-call-icon'}
                style={
                    {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: 'auto',
                        minWidth: '20px',
                        marginLeft: 'auto',
                        marginRight: '4px',
                    }
                }
            >
                <ActiveCallIcon
                    fill={props.theme.sidebarText}
                    style={{minWidth: '12px', maxWidth: '12px', minHeight: '12px', maxHeight: '12px'}}
                />
            </span>
        </OverlayTrigger>
    );
};

export default ChannelLinkLabel;
