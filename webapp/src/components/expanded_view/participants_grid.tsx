import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';
import {Client4} from 'mattermost-redux/client';
import React, {useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {getUserDisplayName} from 'src/utils';
import styled from 'styled-components';

import CallParticipant, {TileSize} from './call_participant';

type Props = {
    callID: string,
    callHostID: string,
    currentSessionID: string,
    currentUserID: string,
    profiles: IDMappedObjects<UserProfile>,
    sessions: UserSessionState[],
    onParticipantRemove: (sessionID: string, userID: string) => void,
};

const tileSizesMap = {
    [TileSize.Small]: {
        width: 96,
        height: 164,
    },
    [TileSize.Medium]: {
        width: 128,
        height: 204,
    },
    [TileSize.Large]: {
        width: 160,
        height: 236,
    },
    [TileSize.ExtraLarge]: {
        width: 208,
        height: 292,
    },
};

export default function ParticipantsGrid({
    callID,
    callHostID,
    currentSessionID,
    currentUserID,
    profiles,
    sessions,
    onParticipantRemove,
}: Props) {
    const {formatMessage} = useIntl();

    const ref = useRef<HTMLDivElement>(null);

    const [tileSize, setTileSize] = useState(TileSize.Small);
    const [columns, setColumns] = useState(1);

    // This is needed to force a re-render on element resize and recalculate the dynamic sizes.
    const [resize, setResize] = useState(false);

    const computeSizes = () => {
        const res = {
            columns: 1,
            tileSize: TileSize.Small,
        };

        if (!ref.current) {
            return res;
        }

        const width = ref.current.clientWidth;
        const height = ref.current.clientHeight;

        const hMargin = Math.min(0.12 * width, 150);
        const vMargin = 0.12 * height;

        const availableWidth = width - (2 * hMargin);
        const availableHeight = height - (2 * vMargin);

        const tileSpacing = 8;

        for (const size of [TileSize.ExtraLarge, TileSize.Large, TileSize.Medium, TileSize.Small]) {
            const tileWidthWithSpacing = tileSizesMap[size].width + tileSpacing; // Include horizontal spacing
            const tileHeightWithSpacing = tileSizesMap[size].height + tileSpacing; // Include vertical spacing

            // Calculate how many tiles can fit in a single row and the number of required rows
            const tilesPerRow = Math.floor((availableWidth + tileSpacing) / tileWidthWithSpacing); // Adjust for effective width with spacing

            res.columns = Math.min(sessions.length, tilesPerRow);

            // Calculate rows needed based on tiles per row
            const requiredRows = Math.ceil(sessions.length / tilesPerRow);

            // Calculate the total height required including the spacing between rows
            const totalHeightNeeded = (requiredRows * tileHeightWithSpacing) - tileSpacing; // Adjust for last row not needing spacing

            // Check if the current tile size fits within the available height
            if (totalHeightNeeded <= availableHeight) {
                // If size fits we can return
                res.tileSize = size;
                break;
            }
        }

        // If no size fits perfectly, return the smallest size
        return res;
    };

    useEffect(() => {
        if (!ref.current) {
            // eslint-disable-next-line no-undefined
            return undefined;
        }
        const resizeObserver = new ResizeObserver(() => {
            // Trigger re-render on element resize
            setResize((val) => !val);
        });
        resizeObserver.observe(ref.current);

        // Clean up
        return () => resizeObserver.disconnect();
    }, []);

    useEffect(() => {
        const res = computeSizes();
        setTileSize(res.tileSize);
        setColumns(res.columns);
    }, [sessions.length, resize]);

    const renderParticipants = () => {
        return sessions.map((session) => {
            const isMuted = !session.unmuted;
            const isSpeaking = Boolean(session.voice);
            const isHandRaised = Boolean(session.raised_hand > 0);
            const profile = profiles[session.user_id];

            if (!profile) {
                return null;
            }

            return (
                <CallParticipant
                    key={session.session_id}
                    name={`${getUserDisplayName(profile)} ${session.session_id === currentSessionID ? formatMessage({defaultMessage: '(you)'}) : ''}`}
                    size={tileSize}
                    pictureURL={Client4.getProfilePictureUrl(profile.id, profile.last_picture_update)}
                    isMuted={isMuted}
                    isSpeaking={isSpeaking}
                    isHandRaised={isHandRaised}
                    reaction={session?.reaction}
                    isYou={session.session_id === currentSessionID}
                    isHost={profile.id === callHostID}
                    iAmHost={currentUserID === callHostID}
                    callID={callID}
                    userID={session.user_id}
                    sessionID={session.session_id}
                    isSharingScreen={false}
                    onRemove={() => onParticipantRemove(session.session_id, session.user_id)}
                />
            );
        });
    };

    return (
        <ParticipantsGridContainer ref={ref}>
            <ParticipantsList
                id='calls-expanded-view-participants-grid'
                $columns={columns}
            >
                {renderParticipants()}
            </ParticipantsList>
        </ParticipantsGridContainer>
    );
}

const ParticipantsList = styled.ul<{$columns: number}>`
  display: grid;
  overflow: auto;
  margin: auto;
  padding: 0;
  grid-gap: 8px;
  grid-template-columns: repeat(${({$columns}) => $columns}, 1fr);
`;

const ParticipantsGridContainer = styled.div`
  display: flex;
  flex: 1;
  overflow: auto;
  background: rgba(var(--button-color-rgb), 0.08);
  border-radius: 8px;
  margin: 0 12px;
`;

