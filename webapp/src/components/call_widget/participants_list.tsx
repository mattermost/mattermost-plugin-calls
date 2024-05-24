import './component.scss';

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';
import React from 'react';
import {useIntl} from 'react-intl';
import {hostMuteOthers} from 'src/actions';
import {Participant} from 'src/components/call_widget/participant';
import {useHostControls} from 'src/components/expanded_view/hooks';
import CompassIcon from 'src/components/icons/compassIcon';
import styled from 'styled-components';

type Props = {
    sessions: UserSessionState[];
    profiles: IDMappedObjects<UserProfile>;
    callHostID: string;
    onRemove: (sessionID: string, userID: string) => void;
    currentSession?: UserSessionState;
    screenSharingSession?: UserSessionState;
    callID?: string;
};

export const ParticipantsList = ({
    sessions,
    profiles,
    callHostID,
    onRemove,
    currentSession,
    screenSharingSession,
    callID,
}: Props) => {
    const {formatMessage} = useIntl();
    const isHost = currentSession?.user_id === callHostID;
    const {hostControlsAvailable} = useHostControls(false, false, isHost);
    const showMuteOthers = hostControlsAvailable && sessions.some((s) => s.unmuted && s.user_id !== currentSession?.user_id);

    const renderParticipants = () => {
        return sessions.map((session) => (
            <Participant
                key={session.session_id}
                session={session}
                profile={profiles[session.user_id]}
                isYou={session.session_id === currentSession?.session_id}
                isHost={callHostID === session.user_id}
                iAmHost={isHost}
                isSharingScreen={screenSharingSession?.session_id === session.session_id}
                callID={callID}
                onRemove={() => onRemove(session.session_id, session.user_id)}
            />
        ));
    };

    return (
        <div
            id='calls-widget-participants-menu'
            className='Menu'
        >
            <ul
                id='calls-widget-participants-list'
                className='Menu__content dropdown-menu'
                style={styles.participantsList}
            >
                <li
                    className='MenuHeader'
                    style={styles.participantsListHeader}
                >
                    {formatMessage({defaultMessage: 'Participants'})}
                    {showMuteOthers &&
                        <MuteOthersButton onClick={() => hostMuteOthers(callID)}>
                            <CompassIcon icon={'microphone-off'}/>
                            {formatMessage({defaultMessage: 'Mute others'})}
                        </MuteOthersButton>
                    }
                </li>
                {renderParticipants()}
            </ul>
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = ({
    participantsList: {
        width: '100%',
        minWidth: 'revert',
        maxWidth: 'revert',
        maxHeight: '200px',
        overflow: 'auto',
        position: 'relative',
        borderRadius: '8px',
        border: '1px solid rgba(var(--center-channel-color-rgb), 0.16)',
        boxShadow: 'none',
        margin: 0,

        /* @ts-ignore */
        appRegion: 'no-drag',
    },
    participantsListHeader: {
        position: 'sticky',
        top: '0',
        transform: 'translateY(-8px)',
        padding: '8px 0 0 20px',
        color: 'var(--center-channel-color)',
        background: 'var(--center-channel-bg)',

        /* @ts-ignore */
        appRegion: 'drag',
    },
});

const MuteOthersButton = styled.button`
    display: flex;
    padding: 4px 10px;
    margin-right: 8px;
    margin-left: auto;
    gap: 2px;
    font-family: 'Open Sans', sans-serif;
    font-size: 11px;
    font-weight: 600;
    line-height: 16px;
    color: var(--button-bg);

    border: none;
    background: none;
    border-radius: 4px;

    &:hover {
        // thanks style sheets...
        background: rgba(var(--button-bg-rgb), 0.08) !important;
    }

    i {
        font-size: 14px;
    }
`;
