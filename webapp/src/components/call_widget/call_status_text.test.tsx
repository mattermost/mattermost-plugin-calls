// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserSessionState} from '@mattermost/calls-common/lib/types';
import type {Channel} from '@mattermost/types/channels';
import type {UserProfile} from '@mattermost/types/users';
import {render} from '@testing-library/react';
import React from 'react';
import {createIntl, RawIntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {useDMCallingState} from 'src/components/use_dm_calling_state';
import {usePhoneCallInfo} from 'src/components/use_phone_call_info';
import {channelForCurrentCall} from 'src/selectors';
import {mockStore} from 'src/testUtils';

import {CallParticipantAvatar} from './call_participant_avatar';
import {CallStatusText} from './call_status_text';

jest.mock('src/selectors', () => ({
    channelForCurrentCall: jest.fn(),
}));

jest.mock('src/components/use_dm_calling_state', () => ({
    useDMCallingState: jest.fn(),
}));

jest.mock('src/components/use_phone_call_info', () => ({
    usePhoneCallInfo: jest.fn(),
}));

jest.mock('./speaker_avatar', () => ({
    ParticipantAvatar: ({profile}: {profile?: UserProfile}) => (
        <span
            data-testid='avatar'
            data-shows={profile?.username ?? 'generic'}
        />
    ),
    SpeakerAvatar: () => (
        <span
            data-testid='avatar'
            data-shows='active speaker'
        />
    ),
}));

const intl = createIntl({locale: 'en', messages: {}});

const mock = (fn: unknown) => fn as jest.Mock;

const otherUser = {id: 'other-user-id', username: 'other'} as UserProfile;
const speaker = {id: 'speaking-user-id', username: 'speaker'} as UserProfile;

const speakerSession = {
    session_id: 'speaker-session',
    user_id: speaker.id,
    unmuted: true,
    voice: true,
    raised_hand: 0,
} as UserSessionState;

const dmChannel = {id: 'channel-id', name: 'user-id__other-user-id', type: 'D'} as Channel;
const openChannel = {id: 'channel-id', name: 'town-square', type: 'O'} as Channel;

type Opts = {
    channel?: Channel;
    isDMCalling?: boolean;
};

const renderHeader = ({channel = dmChannel, isDMCalling = false}: Opts = {}) => {
    mock(channelForCurrentCall).mockReturnValue(channel);
    mock(usePhoneCallInfo).mockReturnValue({isPhoneCall: false});
    mock(useDMCallingState).mockReturnValue({
        isDM: channel.type === 'D',
        isDMCalling,
        dmCallee: channel.type === 'D' ? otherUser : undefined,
    });

    const props = {
        sessions: [speakerSession],
        profiles: {[speaker.id]: speaker},
    };

    return render(
        <Provider store={mockStore({})}>
            <RawIntlProvider value={intl}>
                <div data-testid='title'>
                    <CallStatusText {...props}/>
                </div>
                <CallParticipantAvatar {...props}/>
            </RawIntlProvider>
        </Provider>,
    );
};

describe('call widget header', () => {
    test.each([
        ['ringing', {isDMCalling: true}],
        ['in the call, while someone is talking', {}],
    ])('a DM call shows the other person without a speaking indicator while %s', (_, opts: Opts) => {
        const {getByTestId} = renderHeader(opts);

        expect(getByTestId('title')).toHaveTextContent(/^other$/);
        expect(getByTestId('avatar')).toHaveAttribute('data-shows', 'other');
    });

    test('other calls show the active speaker', () => {
        const {getByTestId} = renderHeader({channel: openChannel});

        expect(getByTestId('title')).toHaveTextContent('speaker is talking…');
        expect(getByTestId('avatar')).toHaveAttribute('data-shows', 'active speaker');
    });
});
