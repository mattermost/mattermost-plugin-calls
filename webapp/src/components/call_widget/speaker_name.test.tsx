// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserProfile} from '@mattermost/types/users';
import {render} from '@testing-library/react';
import React from 'react';
import {createIntl, RawIntlProvider} from 'react-intl';

import {ParticipantName} from './speaker_name';

const intl = createIntl({locale: 'en', messages: {}});

const stubProfile = (overrides: Partial<UserProfile> = {}) => ({
    id: 'speaking-user-id',
    username: 'speaker',
    ...overrides,
} as UserProfile);

const renderName = (props: {profile?: UserProfile | null; shouldShowIsTalkingText?: boolean}) => {
    const {container} = render(
        <RawIntlProvider value={intl}>
            <ParticipantName {...props}/>
        </RawIntlProvider>,
    );
    return container;
};

describe('ParticipantName', () => {
    test('should show the full name when the user has one', () => {
        const container = renderName({profile: stubProfile({first_name: 'First1', last_name: 'Last1'})});

        expect(container.textContent).toBe('First1 Last1');
    });

    test('should fall back to the username when the user has no full name', () => {
        const container = renderName({profile: stubProfile()});

        expect(container.textContent).toBe('speaker');
    });

    test('should not claim anyone is talking by default', () => {
        const container = renderName({profile: stubProfile()});

        expect(container.textContent).not.toContain('is talking');
        expect(container.querySelector('.isTalkingText')).toBeNull();
    });

    test('should say the user is talking when asked to', () => {
        const container = renderName({profile: stubProfile(), shouldShowIsTalkingText: true});

        expect(container.textContent).toBe('speaker is talking…');
    });

    test('should keep the talking label separate from the name so it can be styled', () => {
        const container = renderName({
            profile: stubProfile({first_name: 'First1', last_name: 'Last1'}),
            shouldShowIsTalkingText: true,
        });

        expect(container.querySelector('.isTalkingText')).toHaveTextContent('is talking…');
    });

    test.each([
        ['null', null],
        ['undefined', undefined],
    ])('should say no one is talking when the profile is %s', (_, profile) => {
        const container = renderName({profile});

        expect(container.textContent).toBe('No one is talking…');
        expect(container.querySelector('.noOneSpeakingText')).not.toBeNull();
    });

    test('should say no one is talking even when asked to show the talking label', () => {
        const container = renderName({profile: null, shouldShowIsTalkingText: true});

        expect(container.textContent).toBe('No one is talking…');
    });
});
