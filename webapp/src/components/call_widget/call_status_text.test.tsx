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
import {channelForCurrentCall} from 'src/selectors';
import {mockStore} from 'src/testUtils';

import {CallStatusText} from './call_status_text';

jest.mock('src/selectors', () => ({
    channelForCurrentCall: jest.fn(),
}));

jest.mock('src/components/use_dm_calling_state', () => ({
    useDMCallingState: jest.fn(),
}));

const intl = createIntl({locale: 'en', messages: {}});

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

const renderText = ({channel = dmChannel, isDMCalling = false, clientConnecting = false, calleeLoaded = true}: Opts = {}) => {
    mock(channelForCurrentCall).mockReturnValue(channel ?? undefined);
    mock(useDMCallingState).mockReturnValue({
        isDM: channel?.type === 'D',
        isDMCalling,
        dmCallee: calleeLoaded ? callee : undefined,
    });

    const {container} = render(
        <Provider store={mockStore({})}>
            <RawIntlProvider value={intl}>
                <CallStatusText
                    sessions={[speakerSession]}
                    profiles={{[speaker.id]: speaker}}
                    clientConnecting={clientConnecting}
                />
            </RawIntlProvider>
        </Provider>,
    );
    return container;
};

describe('CallStatusText', () => {
    test('should name the callee while the DM call client is still connecting', () => {
        const container = renderText({clientConnecting: true});

        expect(container.textContent).toBe('callee');
    });

    test('should name the callee while the DM call is ringing', () => {
        const container = renderText({isDMCalling: true});

        expect(container.textContent).toBe('callee');
    });

    test('should name the active speaker once the DM call is connected and answered', () => {
        const container = renderText();

        expect(container.textContent).toBe('speaker is talking…');
    });

    test('should name the active speaker in a channel call even while connecting', () => {
        const container = renderText({channel: openChannel, clientConnecting: true});

        expect(container.textContent).toBe('speaker is talking…');
    });

    test('should render nothing when the call channel is not in the store yet', () => {
        const container = renderText({channel: null, clientConnecting: true});

        expect(container).toBeEmptyDOMElement();
    });

    test('should not claim the callee is talking while connecting', () => {
        const container = renderText({clientConnecting: true});

        expect(container.textContent).not.toContain('is talking');
    });

    test('should render nothing when connecting or ringing and the callee profile has not loaded yet', () => {
        const connecting = renderText({clientConnecting: true, calleeLoaded: false});
        const ringing = renderText({isDMCalling: true, calleeLoaded: false});

        expect(connecting).toBeEmptyDOMElement();
        expect(ringing).toBeEmptyDOMElement();
        expect(connecting.textContent).not.toContain('No one is talking');
        expect(ringing.textContent).not.toContain('No one is talking');
        expect(connecting.textContent).not.toContain('speaker');
        expect(ringing.textContent).not.toContain('speaker');
    });
});
