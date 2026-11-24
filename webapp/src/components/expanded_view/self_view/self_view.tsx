// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './self_view.scss';

import EyeOutlineIcon from '@mattermost/compass-icons/components/eye-outline';
import {Button} from '@mattermost/compass-ui/components/button';
import {Icon} from '@mattermost/compass-ui/components/icon';
import classNames from 'classnames';
import React, {useState} from 'react';
import {defineMessage, MessageDescriptor, useIntl} from 'react-intl';
import VideoTile from 'src/components/video_tile';
import type {SelfViewCorner} from 'src/types/types';

import SelfViewMenu from './self_view_menu';
import {readSelfViewState, writeSelfViewState} from './self_view_position';
import {useSelfViewPosition} from './use_self_view_position';

const MOVED_ANNOUNCEMENTS: Record<SelfViewCorner, MessageDescriptor> = {
    'top-left': defineMessage({defaultMessage: 'Self view moved to top left'}),
    'top-right': defineMessage({defaultMessage: 'Self view moved to top right'}),
    'bottom-left': defineMessage({defaultMessage: 'Self view moved to bottom left'}),
    'bottom-right': defineMessage({defaultMessage: 'Self view moved to bottom right'}),
};

const TILE_LABELS: Record<SelfViewCorner, MessageDescriptor> = {
    'top-left': defineMessage({defaultMessage: 'Self view, top left. Drag or use the arrow keys to move it.'}),
    'top-right': defineMessage({defaultMessage: 'Self view, top right. Drag or use the arrow keys to move it.'}),
    'bottom-left': defineMessage({defaultMessage: 'Self view, bottom left. Drag or use the arrow keys to move it.'}),
    'bottom-right': defineMessage({defaultMessage: 'Self view, bottom right. Drag or use the arrow keys to move it.'}),
};

type Props = {
    sessionID: string;
};

export default function SelfView({sessionID}: Props) {
    const {formatMessage} = useIntl();
    const [initialState] = useState(readSelfViewState);
    const [hidden, setHidden] = useState(initialState.hidden);
    const [announcement, setAnnouncement] = useState('');

    const {corner, dragging, containerRef, setTileElement, moveTo, tileHandlers} = useSelfViewPosition({
        initialCorner: initialState.corner,
        onCornerChange: (next) => {
            writeSelfViewState({corner: next});
            setAnnouncement(formatMessage(MOVED_ANNOUNCEMENTS[next]));
        },
    });

    const setHiddenAndSave = (next: boolean) => {
        setHidden(next);
        writeSelfViewState({hidden: next});
        setAnnouncement(next ? formatMessage({defaultMessage: 'Self view hidden'}) : formatMessage({defaultMessage: 'Self view shown'}));
    };

    return (
        <div
            ref={containerRef}
            className='SelfView'
            data-testid='calls-self-view'
        >
            {hidden ? (
                <div className={classNames('SelfView__chip', `SelfView__chip--${corner}`)}>
                    <Button
                        id='calls-self-view-show'
                        emphasis='tertiary'
                        appearance='inverted'
                        size='small'
                        leadingIcon={<Icon glyph={<EyeOutlineIcon/>}/>}
                        onClick={() => setHiddenAndSave(false)}
                    >
                        {formatMessage({defaultMessage: 'Show self view'})}
                    </Button>
                </div>
            ) : (
                <div
                    ref={setTileElement}
                    className={classNames('SelfView__tile', {'SelfView__tile--dragging': dragging})}
                    data-testid='calls-self-view-tile'
                    data-corner={corner}
                    role='group'
                    tabIndex={0}
                    aria-label={formatMessage(TILE_LABELS[corner])}
                    {...tileHandlers}
                >
                    <VideoTile
                        sessionID={sessionID}
                        size='small'
                        isSelf={true}
                        hideMuteState={true}
                    />
                    <div className='SelfView__menuAnchor'>
                        <SelfViewMenu
                            corner={corner}
                            onMove={moveTo}
                            onHide={() => setHiddenAndSave(true)}
                        />
                    </div>
                </div>
            )}
            <div
                className='SelfView__announcer'
                role='status'
                aria-live='polite'
            >
                {announcement}
            </div>
        </div>
    );
}
