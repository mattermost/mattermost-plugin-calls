// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserSessionState} from '@mattermost/calls-common/lib/types';
import type {Channel} from '@mattermost/types/channels';
import type {UserProfile} from '@mattermost/types/users';
import {render} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {useDMCallingState} from 'src/components/use_dm_calling_state';
import {channelForCurrentCall} from 'src/selectors';
import {mockStore} from 'src/testUtils';

import {CallParticipantAvatar} from './call_participant_avatar';

jest.mock('src/selectors', () => ({
    channelForCurrentCall: jest.fn(),
}));

jest.mock('src/components/use_dm_calling_state', () => ({
    useDMCallingState: jest.fn(),
}));

const mock = (fn: unknown) => fn as jest.Mock;

const callee = {id: 'callee-user-id', username: 'callee'} as UserProfile;
const speaker = {id: 'speaking-user-id', username: 'speaker'} as UserProfile;

const speakerSession = {
    session_id: 'speaker-session',
    user_id: speaker.id,
    unmuted: true,
    voice: true,
    raised_hand: 0,
} as UserSessionState;

const dmChannel = {id: 'channel-id', name: 'user-id__callee-user-id', type: 'D'} as Channel;
const openChannel = {id: 'channel-id', name: 'town-square', type: 'O'} as Channel;

type Opts = {
    channel?: Channel | null;
    isDMCalling?: boolean;
    clientConnecting?: boolean;
    calleeLoaded?: boolean;
}

const renderAvatar = ({channel = dmChannel, isDMCalling = false, clientConnecting = false, calleeLoaded = true}: Opts = {}) => {
    mock(channelForCurrentCall).mockReturnValue(channel ?? undefined);
    mock(useDMCallingState).mockReturnValue({
        isDM: channel?.type === 'D',
        isDMCalling,
        dmCallee: calleeLoaded ? callee : undefined,
    });

    const {container} = render(
        <Provider store={mockStore({})}>
            <CallParticipantAvatar
                sessions={[speakerSession]}
                profiles={{[speaker.id]: speaker}}
                clientConnecting={clientConnecting}
            />
        </Provider>,
    );
    return container;
};

describe('CallParticipantAvatar', () => {
    test('should show the callee while the DM call client is still connecting', () => {
        const container = renderAvatar({clientConnecting: true});

        expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining(callee.id));
    });

    test('should show the callee while the DM call is ringing', () => {
        const container = renderAvatar({isDMCalling: true});

        expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining(callee.id));
    });

    test('should show the active speaker once the DM call is connected and answered', () => {
        const container = renderAvatar();

        expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining(speaker.id));
    });

    test('should show the active speaker in a channel call even while connecting', () => {
        const container = renderAvatar({channel: openChannel, clientConnecting: true});

        expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining(speaker.id));
    });

    test('should render nothing when the call channel is not in the store yet', () => {
        const container = renderAvatar({channel: null, clientConnecting: true});

        expect(container).toBeEmptyDOMElement();
    });

    test('should fall back to the generic icon when the callee profile has not loaded yet', () => {
        const container = renderAvatar({clientConnecting: true, calleeLoaded: false});

        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('.genericAvatar')).not.toBeNull();
    });
});
