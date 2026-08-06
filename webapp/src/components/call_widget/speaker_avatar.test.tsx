// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserProfile} from '@mattermost/types/users';
import {render} from '@testing-library/react';
import React from 'react';

import {ParticipantAvatar} from './speaker_avatar';

const userID = 'speaking-user-id';

const stubProfile = (overrides: Partial<UserProfile> = {}) => ({
    id: userID,
    username: 'speaker',
    ...overrides,
} as UserProfile);

const renderAvatar = (profile?: UserProfile | null) => {
    const {container} = render(<ParticipantAvatar profile={profile}/>);
    return container;
};

describe('ParticipantAvatar', () => {
    test('should show the profile picture of the user it is given', () => {
        const container = renderAvatar(stubProfile());

        expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining(userID));
    });

    test('should bust the picture cache with the last update time', () => {
        const container = renderAvatar(stubProfile({last_picture_update: 1234}));

        expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining('_=1234'));
    });

    test('should not add a cache buster when the picture has never been updated', () => {
        const container = renderAvatar(stubProfile());

        expect(container.querySelector('img')).not.toHaveAttribute('src', expect.stringContaining('_='));
    });

    test('should not fall back to the generic icon when it has a profile', () => {
        const container = renderAvatar(stubProfile());

        expect(container.querySelector('.genericAvatar')).toBeNull();
    });

    test.each([
        ['null', null],
        ['undefined', undefined],
    ])('should show the generic icon instead of a picture when the profile is %s', (_, profile) => {
        const container = renderAvatar(profile);

        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('.genericAvatar')).not.toBeNull();
        expect(container.querySelector('.CompassIcon.icon-account-outline')).not.toBeNull();
    });

    test.each([
        ['a profile', stubProfile()],
        ['no profile', null],
    ])('should keep the avatar container so the widget layout does not shift with %s', (_, profile) => {
        const container = renderAvatar(profile);

        expect(container.querySelector('.participantAvatarContainer')).not.toBeNull();
    });
});
