// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserSessionState} from '@mattermost/calls-common/lib/types';
import type {UserProfile} from '@mattermost/types/users';
import type {IDMappedObjects} from '@mattermost/types/utilities';

import {getActiveSpeakerProfile} from './active_speaker';

const stubSession = (userID: string, voice = false) => ({
    session_id: `${userID}-session`,
    user_id: userID,
    voice,
    unmuted: voice,
    raised_hand: 0,
} as UserSessionState);

const stubProfiles = (...userIDs: string[]) => Object.fromEntries(
    userIDs.map((id) => [id, {id, username: id} as UserProfile]),
) as IDMappedObjects<UserProfile>;

describe('getActiveSpeakerProfile', () => {
    test('should return the profile of the session that has voice', () => {
        const sessions = [stubSession('quiet-user'), stubSession('talking-user', true)];

        expect(getActiveSpeakerProfile(sessions, stubProfiles('quiet-user', 'talking-user')))
            .toMatchObject({id: 'talking-user'});
    });

    test('should return null when no one is talking', () => {
        const sessions = [stubSession('quiet-user'), stubSession('other-quiet-user')];

        expect(getActiveSpeakerProfile(sessions, stubProfiles('quiet-user', 'other-quiet-user'))).toBeNull();
    });

    test('should return null when there are no sessions in the call', () => {
        expect(getActiveSpeakerProfile([], stubProfiles('some-user'))).toBeNull();
    });

    test('should return the first talking session when several are talking at once', () => {
        // Sessions arrive in a stable order, so the widget shouldn't flip between simultaneous
        // speakers on every render.
        const sessions = [stubSession('first-talker', true), stubSession('second-talker', true)];

        expect(getActiveSpeakerProfile(sessions, stubProfiles('first-talker', 'second-talker')))
            .toMatchObject({id: 'first-talker'});
    });

    test('should skip a talking session whose profile has not loaded and use the next one', () => {
        // Profiles are fetched asynchronously, so a session can be talking before we know who they are.
        const sessions = [stubSession('unknown-user', true), stubSession('known-user', true)];

        expect(getActiveSpeakerProfile(sessions, stubProfiles('known-user'))).toMatchObject({id: 'known-user'});
    });

    test('should return null when the only talking session has no loaded profile', () => {
        const sessions = [stubSession('unknown-user', true)];

        expect(getActiveSpeakerProfile(sessions, stubProfiles('someone-else'))).toBeNull();
    });

    test('should ignore a loaded profile whose session is not talking', () => {
        const sessions = [stubSession('quiet-user')];

        expect(getActiveSpeakerProfile(sessions, stubProfiles('quiet-user'))).toBeNull();
    });
});
