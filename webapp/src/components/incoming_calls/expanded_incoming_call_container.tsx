// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './expanded_incoming_call_container.scss';

import CloseIcon from '@mattermost/compass-icons/components/close';
import PhoneInTalkIcon from '@mattermost/compass-icons/components/phone-in-talk';
import {Button} from '@mattermost/compass-ui/components/button';
import {Icon} from '@mattermost/compass-ui/components/icon';
import {IconButton} from '@mattermost/compass-ui/components/icon-button';
import {UserAvatar} from '@mattermost/compass-ui/components/user-avatar';
import {GlobalState} from '@mattermost/types/store';
import {getUser} from 'mattermost-redux/selectors/entities/users';
import React from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import RestClient from 'src/clients/rest';
import {
    useDismissJoin,
    useGetCallerNameAndOthers,
    useOnChannelLinkClick,
    useRingingAndNotification,
} from 'src/components/incoming_calls/hooks';
import {ringingEnabled, sortedIncomingCalls} from 'src/selectors';
import {ChannelType, IncomingCallNotification} from 'src/types/types';

export const ExpandedIncomingCallContainer = () => {
    const {formatMessage} = useIntl();
    const enabled = useSelector(ringingEnabled);
    const calls = useSelector(sortedIncomingCalls);

    if (!enabled || calls.length === 0) {
        return null;
    }

    return (
        <div
            className='ExpandedIncomingCalls'
            role='region'
            aria-label={formatMessage({defaultMessage: 'Incoming calls'})}
        >
            {calls.map((c) => (
                <ExpandedIncomingCallNotice
                    key={c.callID}
                    call={c}
                />
            ))}
        </div>
    );
};

type NoticeProps = {
    call: IncomingCallNotification;
};

export function ExpandedIncomingCallNotice({call}: NoticeProps) {
    const {formatMessage} = useIntl();
    const caller = useSelector((state: GlobalState) => getUser(state, call.callerID));
    const [callerName, others] = useGetCallerNameAndOthers(call, 10);
    const [onDismiss, onJoin] = useDismissJoin(call.channelID, call.callID);
    const openConversation = useOnChannelLinkClick(call);
    useRingingAndNotification(call, false);

    const isGM = call.type === ChannelType.GM;
    const bold = (text: React.ReactNode) => <b>{text}</b>;
    const label = isGM ? formatMessage({defaultMessage: 'Call from {callerName} with {others}'}, {callerName, others}) : formatMessage({defaultMessage: 'Call from {callerName}'}, {callerName});

    return (
        <div
            className='ExpandedIncomingCall'
            data-testid='call-incoming-condensed'
            role='group'
            aria-label={label}
            onClick={openConversation}
        >
            <UserAvatar
                size='24'
                src={caller ? RestClient.getProfilePictureUrl(caller.id, caller.last_picture_update) : undefined}
                alt=''
                name={callerName}
            />
            <button
                type='button'
                className='ExpandedIncomingCall__message'
                title={label}
                aria-label={formatMessage({defaultMessage: 'Open conversation: {label}'}, {label})}
                onClick={(ev) => {
                    ev.stopPropagation();
                    openConversation();
                }}
            >
                {isGM ? (
                    <FormattedMessage
                        defaultMessage='Call from <b>{callerName}</b> with <b>{others}</b>'
                        values={{b: bold, callerName, others}}
                    />
                ) : (
                    <FormattedMessage
                        defaultMessage='Call from <b>{callerName}</b>'
                        values={{b: bold, callerName}}
                    />
                )}
            </button>
            <Button
                data-testid='call-incoming-condensed-join'
                className='ExpandedIncomingCall__join'
                size='x-small'
                emphasis='tertiary'
                appearance='inverted'
                leadingIcon={<Icon glyph={<PhoneInTalkIcon/>}/>}
                onClick={onJoin}
            >
                {formatMessage({defaultMessage: 'Join'})}
            </Button>
            <IconButton
                data-testid='call-incoming-condensed-dismiss'
                size='x-small'
                // eslint-disable-next-line react/style-prop-object
                style='inverted'
                icon={<Icon glyph={<CloseIcon/>}/>}
                aria-label={formatMessage({defaultMessage: 'Dismiss call from {callerName}'}, {callerName})}
                onClick={onDismiss}
            />
        </div>
    );
}
