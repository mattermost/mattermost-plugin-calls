// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './video_area.scss';

import classNames from 'classnames';
import React from 'react';
import VideoTile from 'src/components/video_tile';

type Props = {
    otherSessionID?: string;
    selfSessionID?: string;
};

export default function VideoArea({otherSessionID, selfSessionID}: Props) {
    return (
        <div className='CallWidgetVideoArea__expander'>
            <div className='CallWidgetVideoArea__clip'>
                <div
                    className='CallWidgetVideoArea'
                    data-testid='calls-widget-video-area'
                >
                    {otherSessionID &&
                        <VideoTile
                            sessionID={otherSessionID}
                            size='large'
                            className='CallWidgetVideoArea__remote'
                        />
                    }
                    {selfSessionID &&
                        <VideoTile
                            sessionID={selfSessionID}
                            size={otherSessionID ? 'small' : 'large'}
                            isSelf={true}
                            hideMuteState={true}
                            className={classNames('CallWidgetVideoArea__selfView', {
                                'CallWidgetVideoArea__selfView--alone': !otherSessionID,
                            })}
                        />
                    }
                </div>
            </div>
        </div>
    );
}
