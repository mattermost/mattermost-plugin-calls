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
    currentSessionID?: string,
    currentUserID?: string,
    profiles: IDMappedObjects<UserProfile>,
    sessions: UserSessionState[],
    onParticipantRemove?: (sessionID: string, userID: string) => void,

    // Used by the recorder client.
    profileImages?: Record<string, string>,
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
    profileImages,
}: Props) {
    const {formatMessage} = useIntl();

    const ref = useRef<HTMLDivElement>(null);

    const [tileSize, setTileSize] = useState(TileSize.Small);
    const [paddingV, setPaddingV] = useState(0);
    const [paddingH, setPaddingH] = useState(0);

    // This is needed to force a re-render on element resize and recalculate the dynamic sizes.
    const [resize, setResize] = useState(false);

    const computeSizes = () => {
        const res = {
            tileSize: TileSize.Small,
            paddingV: 0,
            paddingH: 0,
        };

        if (!ref.current) {
            return res;
        }

        const width = ref.current.clientWidth;
        const height = ref.current.clientHeight;

        const hMargin = Math.min(0.12 * width, 150);
        const vMargin = 0.12 * height;

        res.paddingV = Math.floor(vMargin);
        res.paddingH = Math.floor(hMargin);

        const availableWidth = width - (2 * hMargin);
        const availableHeight = height - (2 * vMargin);

        const tileSpacing = 8;

        for (const size of [TileSize.ExtraLarge, TileSize.Large, TileSize.Medium, TileSize.Small]) {
            const tileWidthWithSpacing = tileSizesMap[size].width + tileSpacing; // Include horizontal spacing
            const tileHeightWithSpacing = tileSizesMap[size].height + tileSpacing; // Include vertical spacing

            // Calculate how many tiles can fit in a single row and the number of required rows
            const tilesPerRow = Math.floor((availableWidth + tileSpacing) / tileWidthWithSpacing); // Adjust for effective width with spacing

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
        setPaddingH(res.paddingH);
        setPaddingV(res.paddingV);
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
                    name={`${getUserDisplayName(profile)} ${currentSessionID && session.session_id === currentSessionID ? formatMessage({defaultMessage: '(you)'}) : ''}`}
                    size={tileSize}
                    pictureURL={profileImages ? profileImages[profile.id] : Client4.getProfilePictureUrl(profile.id, profile.last_picture_update)}
                    isMuted={isMuted}
                    isSpeaking={isSpeaking}
                    isHandRaised={isHandRaised}
                    reaction={session?.reaction}
                    isYou={currentSessionID ? session.session_id === currentSessionID : false}
                    isHost={profile.id === callHostID}
                    iAmHost={currentUserID ? currentUserID === callHostID : false}
                    callID={callID}
                    userID={session.user_id}
                    sessionID={session.session_id}
                    isSharingScreen={false}
                    onRemove={() => {
                        if (onParticipantRemove) {
                            onParticipantRemove(session.session_id, session.user_id);
                        }
                    }
                    }
                />
            );
        });
    };

    return (
        <ParticipantsGridContainer
            ref={ref}
            $paddingV={paddingV}
            $paddingH={paddingH}
        >
            <ParticipantsList
                id='calls-expanded-view-participants-grid'
            >
                {renderParticipants()}
            </ParticipantsList>
        </ParticipantsGridContainer>
    );
}

const ParticipantsList = styled.ul`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  margin: auto;
  padding: 0;
`;

const ParticipantsGridContainer = styled.div<{$paddingH: number, $paddingV: number}>`
  display: flex;
  flex: 1;
  overflow: auto;
  background: rgba(var(--button-color-rgb), 0.08);
  border-radius: 8px;
  margin: 0 12px;
  padding: ${({$paddingV}) => $paddingV}px ${({$paddingH}) => $paddingH}px;
`;

