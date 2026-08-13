// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import React, {CSSProperties, Fragment} from 'react';
import {navigateToURL} from 'src/browser_routing';
import CompassIcon from 'src/components/icons/compassIcon';
import {logDebug} from 'src/log';
import {
    isDMChannel,
    isGMChannel,
    isPrivateChannel,
    isPublicChannel,
    sendDesktopEvent,
    untranslatable,
} from 'src/utils';

interface Props {
    channel?: Channel;
    channelURL: string;
    channelDisplayName: string;
    global?: boolean;
    clientConnecting?: boolean;
}

export function ChannelNameLink(props: Props) {
    function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
        event.preventDefault();

        const message = {pathName: props.channelURL};
        if (props.global) {
            if (window.desktopAPI?.openLinkFromCalls) {
                logDebug('desktopAPI.openLinkFromCalls');
                window.desktopAPI.openLinkFromCalls(props.channelURL);
            } else {
                // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
                sendDesktopEvent('calls-widget-channel-link-click', message);
            }
        } else {
            navigateToURL(props.channelURL);
        }
    }

    if (props.clientConnecting) {
        return null;
    }

    if (isDMChannel(props.channel)) {
        return null;
    }

    return (
        <Fragment>
            <div style={{margin: '0 2px 0 4px'}}>{untranslatable('•')}</div>

            <a
                href={props.channelURL}
                onClick={handleClick}
                className='calls-channel-link'
                style={{appRegion: 'no-drag', padding: '0', minWidth: 0} as CSSProperties}
            >
                {isPublicChannel(props.channel) && <CompassIcon icon='globe'/>}
                {isPrivateChannel(props.channel) && <CompassIcon icon='lock'/>}
                {isGMChannel(props.channel) && <CompassIcon icon='account-multiple-outline'/>}
                <span
                    style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: 600,
                        letterSpacing: '0.02em',
                    }}
                >
                    {props.channelDisplayName}
                </span>
            </a>
        </Fragment>
    );
}
