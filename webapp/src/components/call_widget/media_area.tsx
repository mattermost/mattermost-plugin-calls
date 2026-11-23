// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './media_area.scss';

import classNames from 'classnames';
import React, {useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {defineMessage, IntlShape, MessageDescriptor, useIntl} from 'react-intl';
import type {ScreenShareTrack, ScreenSharingSession} from 'src/clients/call/types';
import ScreenSharePlayer from 'src/components/screen_share_player';
import {useScreenShareTrack} from 'src/components/use_screen_share_track';
import VideoTile from 'src/components/video_tile';

export type CameraSessions = {
    otherSessionID?: string;
    selfSessionID?: string;
};

type Props = {
    shareAllowed: boolean;

    // Shown on someone else's share once their profile is known.
    presenterName?: string;
    onStopSharing: () => void;

    // Null when no camera is on, or the call has no camera video.
    cameras: CameraSessions | null;
};

type ContentByKind = {
    share: {share: ScreenSharingSession; presenterName?: string};
    cameras: {cameras: CameraSessions};
};

type Content<K extends keyof ContentByKind = keyof ContentByKind> = {[P in K]: {kind: P} & ContentByKind[P]}[K];

type ContentRenderers = {[K in keyof ContentByKind]: (content: Content<K>) => React.ReactNode};

// Covers the 300ms collapse when transitionend never fires, as in a hidden tab.
const COLLAPSE_FALLBACK_MS = 500;

// A screen share takes the area over from cameras, and the area only shows when there is something to show.
const getContent = (share: ScreenSharingSession | null, shareAllowed: boolean, presenterName: string | undefined, cameras: CameraSessions | null): Content | null => {
    if (share && shareAllowed) {
        return {kind: 'share', share, presenterName};
    }
    return cameras ? {kind: 'cameras', cameras} : null;
};

const prefersReducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

type Phase = 'closed' | 'opening' | 'open';

// Keeps the area mounted while it collapses, so it can shrink away or grow back from wherever it got to.
function useCollapse(open: boolean) {
    const [phase, setPhase] = useState<Phase>(open ? 'opening' : 'closed');
    const expanderRef = useRef<HTMLDivElement>(null);

    if (open && phase === 'closed') {
        setPhase('opening');
    } else if (!open && (phase === 'opening' || (phase === 'open' && prefersReducedMotion()))) {
        setPhase('closed');
    }

    useLayoutEffect(() => {
        if (phase === 'opening') {
            // Lays out the collapsed rows first, so the switch to open is a transition rather than a jump.
            expanderRef.current?.getBoundingClientRect();
            setPhase('open');
        }
    }, [phase]);

    const mounted = phase !== 'closed';
    useEffect(() => {
        if (open || !mounted) {
            return undefined;
        }
        const timeout = setTimeout(() => setPhase('closed'), COLLAPSE_FALLBACK_MS);
        return () => clearTimeout(timeout);
    }, [open, mounted]);

    const onTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
        if (!open && e.target === e.currentTarget) {
            setPhase('closed');
        }
    };

    return {mounted, collapsed: !open || phase === 'opening', expanderRef, onTransitionEnd};
}

export default function MediaArea({shareAllowed, presenterName, onStopSharing, cameras}: Props) {
    const liveContent = getContent(useScreenShareTrack(), shareAllowed, presenterName, cameras);
    const lastContent = useRef(liveContent);
    if (liveContent) {
        lastContent.current = liveContent;
    }
    const {mounted, collapsed, expanderRef, onTransitionEnd} = useCollapse(Boolean(liveContent));

    const content = liveContent ?? lastContent.current;
    if (!mounted || !content) {
        return null;
    }

    const renderers: ContentRenderers = {
        share: (shown) => (
            <ScreenShare
                share={shown.share}
                presenterName={shown.presenterName}
                onStopSharing={onStopSharing}
            />
        ),
        cameras: (shown) => <CameraTiles {...shown.cameras}/>,
    };
    const renderContent = <K extends keyof ContentByKind>(shown: Content<K>) => renderers[shown.kind](shown);

    // The expander stays mounted while the content switches, so it only grows when the area first appears.
    // While collapsing it keeps showing the last content, which is stale, so it is hidden from input.
    return (
        <div
            ref={expanderRef}
            className={classNames('CallWidgetMediaArea__expander', {
                'CallWidgetMediaArea__expander--collapsed': collapsed,
            })}
            aria-hidden={!liveContent}
            onTransitionEnd={onTransitionEnd}
        >
            <div className='CallWidgetMediaArea__clip'>
                <div
                    className='CallWidgetMediaArea'
                    data-testid='calls-widget-media-area'
                >
                    {renderContent(content)}
                </div>
            </div>
        </div>
    );
}

type DisplaySurface = 'monitor' | 'window' | 'browser';

const OWN_SHARE_MESSAGES: Record<DisplaySurface, MessageDescriptor> = {
    monitor: defineMessage({defaultMessage: 'You are presenting your entire screen'}),
    window: defineMessage({defaultMessage: 'You are presenting a window'}),
    browser: defineMessage({defaultMessage: 'You are presenting a tab'}),
};

const isDisplaySurface = (surface: unknown): surface is DisplaySurface =>
    typeof surface === 'string' && Object.hasOwn(OWN_SHARE_MESSAGES, surface);

// Browsers only report the surface for getDisplayMedia captures, so Safari and the Desktop app fall back.
const getOwnShareText = (track: ScreenShareTrack | null, formatMessage: IntlShape['formatMessage']) => {
    const surface = track?.mediaStreamTrack.getSettings().displaySurface;
    if (isDisplaySurface(surface)) {
        return formatMessage(OWN_SHARE_MESSAGES[surface]);
    }
    return formatMessage({defaultMessage: 'You are presenting'});
};

type ScreenShareProps = {
    share: ScreenSharingSession;
    presenterName?: string;
    onStopSharing: () => void;
};

function ScreenShare({share, presenterName, onStopSharing}: ScreenShareProps) {
    const {formatMessage} = useIntl();
    const labelID = useId();

    let presentingText: string | undefined;
    if (share.isLocal) {
        presentingText = getOwnShareText(share.track, formatMessage);
    } else if (presenterName) {
        presentingText = formatMessage({defaultMessage: '{name} is presenting'}, {name: presenterName});
    }

    return (
        <div
            className='CallWidgetMediaArea__share'
            role='group'
            aria-labelledby={presentingText ? labelID : undefined}
        >
            <ScreenSharePlayer
                track={share.track}
                className='CallWidgetMediaArea__screen'
                autoPlay={true}
                muted={true}
            />
            {presentingText &&
                <PresentingBar
                    textID={labelID}
                    text={presentingText}
                    onStop={share.isLocal ? onStopSharing : undefined}
                />
            }
        </div>
    );
}

type PresentingBarProps = {
    textID: string;
    text: string;

    // Only your own share has the live dot and can be stopped from here.
    onStop?: () => void;
};

function PresentingBar({textID, text, onStop}: PresentingBarProps) {
    const {formatMessage} = useIntl();

    return (
        <div className='CallWidgetMediaArea__presenting'>
            {onStop && <span className='CallWidgetMediaArea__liveDot'/>}
            <span
                id={textID}
                className='CallWidgetMediaArea__overlayText'
            >
                {text}
            </span>
            {onStop &&
                <button
                    id='calls-widget-stop-screenshare'
                    data-testid='calls-widget-stop-screenshare'
                    type='button'
                    className='CallWidgetMediaArea__stop'
                    onClick={onStop}
                >
                    {formatMessage({defaultMessage: 'Stop'})}
                </button>
            }
        </div>
    );
}

function CameraTiles({otherSessionID, selfSessionID}: CameraSessions) {
    return (
        <>
            {otherSessionID &&
                <VideoTile
                    sessionID={otherSessionID}
                    size='large'
                    className='CallWidgetMediaArea__remote'
                />
            }
            {selfSessionID &&
                <VideoTile
                    sessionID={selfSessionID}
                    size={otherSessionID ? 'small' : 'large'}
                    isSelf={true}
                    hideMuteState={true}
                    className={classNames('CallWidgetMediaArea__selfView', {
                        'CallWidgetMediaArea__selfView--alone': !otherSessionID,
                    })}
                />
            }
        </>
    );
}
