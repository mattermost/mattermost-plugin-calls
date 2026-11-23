// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './video_tile.scss';

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {UserProfile} from '@mattermost/types/users';
import classNames from 'classnames';
import type {VideoTrack} from 'livekit-client';
import {Client4} from 'mattermost-redux/client';
import React, {useEffect, useRef, useState} from 'react';
import {Overlay, Tooltip} from 'react-bootstrap';
import {useIntl} from 'react-intl';
import {CameraState} from 'src/clients/call/types';
import Avatar from 'src/components/avatar/avatar';
import {Emoji} from 'src/components/emoji/emoji';
import HandEmoji from 'src/components/icons/hand';
import MutedIcon from 'src/components/icons/muted_icon';
import UnmutedIcon from 'src/components/icons/unmuted_icon';
import VideoTrackPlayer from 'src/components/video_track_player/video_track_player';
import type {ConnectionState} from 'src/state/connection_quality/reducer';
import {getUserDisplayName} from 'src/utils';

export type VideoTileSize = 'large' | 'small';

export type VideoTileState = 'video' | 'off' | 'loading' | 'poor' | 'reconnecting';

export type Props = {
    session: UserSessionState;
    profile?: UserProfile;
    track: VideoTrack | null;
    cameraState: CameraState;
    connectionState: ConnectionState;
    size: VideoTileSize;
    isSelf?: boolean;
    isMirrored?: boolean;
    hideMuteState?: boolean;
    className?: string;
};

const AVATAR_SIZE_PX: Record<VideoTileSize, number> = {
    large: 72,
    small: 32,
};

const AVATAR_FONT_SIZE_PX: Record<VideoTileSize, number> = {
    large: 24,
    small: 12,
};

const BADGE_EMOJI_SIZE_PX = 14;

// hasFrames is false until the video element is actually playing, which can lag the track.
export const getVideoTileState = (cameraState: CameraState, hasFrames: boolean, connectionState: ConnectionState): VideoTileState => {
    if (connectionState === 'reconnecting') {
        return 'reconnecting';
    }

    switch (cameraState) {
    case CameraState.Off:
        return 'off';
    case CameraState.Loading:
        return 'loading';
    case CameraState.Ready:
        if (!hasFrames) {
            return 'loading';
        }
        return connectionState === 'poor' ? 'poor' : 'video';
    default: {
        const unhandled: never = cameraState;
        return unhandled;
    }
    }
};

export default function VideoTile({
    session,
    profile,
    track,
    cameraState,
    connectionState,
    size,
    isSelf = false,
    isMirrored = false,
    hideMuteState = false,
    className,
}: Props) {
    const {formatMessage} = useIntl();
    const videoWrapperRef = useRef<HTMLDivElement>(null);
    const poorBadgeRef = useRef<HTMLDivElement>(null);
    const [playingTrack, setPlayingTrack] = useState<VideoTrack | null>(null);
    const [showPoorTooltip, setShowPoorTooltip] = useState(false);

    const showVideo = cameraState === CameraState.Ready && Boolean(track);
    const hasFrames = showVideo && playingTrack === track;
    const tileState = getVideoTileState(cameraState, hasFrames, connectionState);
    const isFrozen = hasFrames && connectionState !== 'good';

    const isMuted = !session.unmuted;
    const isSpeaking = Boolean(session.voice);
    const isHandRaised = session.raised_hand > 0;
    const reaction = session.reaction;

    // Holds the last frame on screen while the connection is degraded.
    useEffect(() => {
        const video = videoWrapperRef.current?.querySelector('video');
        if (!video) {
            return;
        }
        if (isFrozen) {
            video.pause();
        } else if (hasFrames && video.paused) {
            video.play().catch(() => undefined);
        }
    }, [isFrozen, hasFrames]);

    const displayName = getUserDisplayName(profile) || formatMessage({defaultMessage: 'Unknown user'});
    const name = isSelf ? `${displayName} ${formatMessage({defaultMessage: '(you)'})}` : displayName;

    const cameraStatus = () => {
        switch (cameraState) {
        case CameraState.Off:
            return formatMessage({defaultMessage: 'camera off'});
        case CameraState.Loading:
            return formatMessage({defaultMessage: 'camera connecting'});
        case CameraState.Ready:
            return hasFrames ? formatMessage({defaultMessage: 'camera on'}) : formatMessage({defaultMessage: 'camera connecting'});
        default: {
            const unhandled: never = cameraState;
            return unhandled;
        }
        }
    };

    const connectionStatus = () => {
        switch (connectionState) {
        case 'good':
            return null;
        case 'poor':
            return formatMessage({defaultMessage: 'poor connection'});
        case 'reconnecting':
            return formatMessage({defaultMessage: 'reconnecting'});
        default: {
            const unhandled: never = connectionState;
            return unhandled;
        }
        }
    };

    const muteStatus = () => {
        if (hideMuteState) {
            return null;
        }
        return isMuted ? formatMessage({defaultMessage: 'muted'}) : formatMessage({defaultMessage: 'unmuted'});
    };

    const statuses = [
        cameraStatus(),
        connectionStatus(),
        muteStatus(),
        isHandRaised ? formatMessage({defaultMessage: 'hand raised'}) : null,
    ].filter(Boolean);
    const ariaLabel = formatMessage({defaultMessage: '{name}: {statuses}'}, {name, statuses: statuses.join(', ')});

    const statusText = () => {
        if (size === 'small') {
            return null;
        }
        switch (tileState) {
        case 'loading':
            return formatMessage({defaultMessage: 'Connecting…'});
        case 'reconnecting':
            return formatMessage({defaultMessage: 'Reconnecting…'});
        case 'video':
        case 'off':
        case 'poor':
            return null;
        default: {
            const unhandled: never = tileState;
            return unhandled;
        }
        }
    };

    const showSpinner = tileState === 'loading' || tileState === 'reconnecting';
    const status = statusText();
    const MuteIcon = isMuted ? MutedIcon : UnmutedIcon;

    return (
        <div
            className={classNames('VideoTile', `VideoTile--${size}`, `VideoTile--${tileState}`, {
                'VideoTile--speaking': isSpeaking,
            }, className)}
            role='img'
            aria-label={ariaLabel}
            data-testid='video-tile'
            data-state={tileState}
        >
            {showVideo && (
                <div
                    ref={videoWrapperRef}
                    className={classNames('VideoTile__video', {
                        'VideoTile__video--visible': hasFrames,
                        'VideoTile__video--mirrored': isMirrored,
                    })}
                >
                    <VideoTrackPlayer
                        track={track}
                        onPlaying={() => setPlayingTrack(track)}
                        muted={true}
                        playsInline={true}
                    />
                </div>
            )}

            {!hasFrames && (
                <div className='VideoTile__avatar'>
                    <Avatar
                        size={AVATAR_SIZE_PX[size]}
                        fontSize={AVATAR_FONT_SIZE_PX[size]}
                        border={false}
                        url={Client4.getProfilePictureUrl(session.user_id, profile?.last_picture_update ?? 0)}
                        username={profile?.username}
                    />
                </div>
            )}

            {showSpinner && (
                <div className='VideoTile__status'>
                    <span className='VideoTile__spinner'/>
                    {status && <span className='VideoTile__statusText'>{status}</span>}
                </div>
            )}

            {(isHandRaised || reaction) && (
                <div className={classNames('VideoTile__badge', 'VideoTile__badge--topLeft', {'VideoTile__badge--hand': isHandRaised})}>
                    {isHandRaised && <HandEmoji/>}
                    {!isHandRaised && (
                        <Emoji
                            emoji={reaction?.emoji}
                            size={BADGE_EMOJI_SIZE_PX}
                        />
                    )}
                </div>
            )}

            {connectionState === 'poor' && (
                <>
                    <div
                        ref={poorBadgeRef}
                        className='VideoTile__badge VideoTile__badge--topRight VideoTile__badge--warning'
                        data-testid='video-tile-poor-connection'
                        onMouseEnter={() => setShowPoorTooltip(true)}
                        onMouseLeave={() => setShowPoorTooltip(false)}
                    >
                        <i className='icon icon-alert-outline'/>
                    </div>
                    <Overlay
                        target={poorBadgeRef.current as HTMLDivElement}
                        show={showPoorTooltip}
                        placement='top'
                    >
                        <Tooltip id={`video-tile-poor-connection-${session.session_id}`}>
                            {formatMessage({defaultMessage: 'Poor connection'})}
                        </Tooltip>
                    </Overlay>
                </>
            )}

            <div className='VideoTile__label'>
                {!hideMuteState && (
                    <MuteIcon
                        className={classNames('VideoTile__muteIcon', {'VideoTile__muteIcon--muted': isMuted})}
                        data-testid={isMuted ? 'video-tile-muted' : 'video-tile-unmuted'}
                    />
                )}
                <span className='VideoTile__name'>{name}</span>
                {isSpeaking && (
                    <span
                        className='VideoTile__wave'
                        data-testid='video-tile-speaking'
                    >
                        <span/>
                        <span/>
                        <span/>
                    </span>
                )}
            </div>
        </div>
    );
}
