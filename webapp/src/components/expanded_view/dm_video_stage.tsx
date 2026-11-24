// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './dm_video_stage.scss';

import {GlobalState} from '@mattermost/types/store';
import {getUser} from 'mattermost-redux/selectors/entities/users';
import React, {useId} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import type {ScreenSharingSession} from 'src/clients/call/types';
import ScreenSharePlayer from 'src/components/screen_share_player';
import {useDMCallingState} from 'src/components/use_dm_calling_state';
import {useScreenShareTrack} from 'src/components/use_screen_share_track';
import VideoTile from 'src/components/video_tile';
import {getUserDisplayName} from 'src/utils';

import {TileSize} from './participant_cell';
import {ParticipantTileLoading} from './participant_tile_loading';
import SelfView from './self_view/self_view';

type Props = {
    selfSessionID: string;
    otherSessionID?: string;
};

export default function DMVideoStage({selfSessionID, otherSessionID}: Props) {
    const share = useScreenShareTrack();

    if (share) {
        return (
            <ShareStage
                share={share}
                selfSessionID={selfSessionID}
                otherSessionID={otherSessionID}
            />
        );
    }

    return (
        <CameraStage
            selfSessionID={selfSessionID}
            otherSessionID={otherSessionID}
        />
    );
}

type CameraStageProps = {
    selfSessionID: string;
    otherSessionID?: string;
};

function CameraStage({selfSessionID, otherSessionID}: CameraStageProps) {
    const {formatMessage} = useIntl();
    const {isDMCalling, dmCalleeID, dmCallee} = useDMCallingState();

    let main: React.ReactNode = null;
    if (otherSessionID) {
        main = (
            <VideoTile
                sessionID={otherSessionID}
                size='stage'
                className='DMVideoStage__remote'
            />
        );
    } else if (isDMCalling) {
        main = (
            <ul
                className='DMVideoStage__ringing'
                data-testid='calls-dm-video-stage-ringing'
            >
                <ParticipantTileLoading
                    userID={dmCalleeID}
                    profile={dmCallee}
                    tileSize={TileSize.ExtraLarge}
                />
            </ul>
        );
    }

    return (
        <div
            className='DMVideoStage'
            data-testid='calls-dm-video-stage'
            role='region'
            aria-label={formatMessage({defaultMessage: 'Call stage'})}
        >
            {main}
            <SelfView sessionID={selfSessionID}/>
        </div>
    );
}

type ShareStageProps = {
    share: ScreenSharingSession;
    selfSessionID: string;
    otherSessionID?: string;
};

function ShareStage({share, selfSessionID, otherSessionID}: ShareStageProps) {
    const {formatMessage} = useIntl();
    const labelID = useId();
    const presenter = useSelector((state: GlobalState) => getUser(state, share.userID));

    let presentingText = formatMessage({defaultMessage: 'You are presenting'});
    if (!share.isLocal) {
        presentingText = formatMessage({defaultMessage: '{name} is presenting'}, {name: getUserDisplayName(presenter)});
    }

    return (
        <div
            className='DMVideoStage DMVideoStage--sharing'
            data-testid='calls-dm-video-stage'
        >
            <div
                className='DMVideoStage__share'
                role='region'
                aria-labelledby={labelID}
            >
                <ScreenSharePlayer
                    track={share.track}
                    className='DMVideoStage__screen'
                    autoPlay={true}
                    muted={true}
                />
                <span
                    id={labelID}
                    className='DMVideoStage__presenting'
                    data-testid='calls-dm-video-stage-presenting'
                >
                    {presentingText}
                </span>
            </div>
            <ul
                className='DMVideoStage__filmstrip'
                aria-label={formatMessage({defaultMessage: 'People in the call'})}
            >
                {otherSessionID &&
                    <li className='DMVideoStage__filmstripItem'>
                        <VideoTile
                            sessionID={otherSessionID}
                            size='small'
                        />
                    </li>
                }
                <li className='DMVideoStage__filmstripItem'>
                    <VideoTile
                        sessionID={selfSessionID}
                        size='small'
                        isSelf={true}
                        hideMuteState={true}
                    />
                </li>
            </ul>
        </div>
    );
}
