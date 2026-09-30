// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CommandArgs} from '@mattermost/types/integrations';
import {defineMessage} from 'react-intl';
import {displayGenericErrorModal} from 'src/actions';

import slashCommandsHandler from './slash_commands';

jest.mock('src/actions', () => ({
    displayGenericErrorModal: jest.fn((title, message) => ({type: 'mock/displayGenericErrorModal', title, message})),
    hostEndCallForEveryone: jest.fn(),
    startCallRecording: jest.fn(),
    stopCallRecording: jest.fn(),
}));
jest.mock('src/selectors', () => ({
    channelIDForCurrentCall: jest.fn(() => ''),
}));

const mockedDisplayGenericErrorModal = displayGenericErrorModal as unknown as jest.Mock;

describe('slashCommandsHandler', () => {
    const args = {channel_id: 'channel-id', team_id: 'team-id'} as CommandArgs;

    const makeStore = () => ({
        dispatch: jest.fn(),
        getState: jest.fn(() => ({})),
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('dial', () => {
        it.each(['/call dial', '/call dial   '])('asks for a phone number when none is given (%p)', async (message) => {
            const store = makeStore();
            const joinCall = jest.fn();
            const dialPhoneNumber = jest.fn();

            const res = await slashCommandsHandler(store as never, joinCall, dialPhoneNumber, message, args);

            expect(res).toEqual({});
            expect(dialPhoneNumber).not.toHaveBeenCalled();
            expect(joinCall).not.toHaveBeenCalled();
            expect(mockedDisplayGenericErrorModal).toHaveBeenCalledWith(
                defineMessage({defaultMessage: 'Unable to place phone call'}),
                defineMessage({defaultMessage: 'Enter a phone number to call'}),
            );
            expect(store.dispatch).toHaveBeenCalledWith(mockedDisplayGenericErrorModal.mock.results[0].value);
        });

        it.each([
            ['/call dial +15550100', '+15550100'],
            ['/call dial +1 555 0100', '+1 555 0100'],
            ['  /call   dial  +1   555 0100  ', '+1 555 0100'],
        ])('passes the number to dialPhoneNumber (%p)', async (message, expectedNumber) => {
            const store = makeStore();
            const joinCall = jest.fn();
            const dialPhoneNumber = jest.fn();

            const res = await slashCommandsHandler(store as never, joinCall, dialPhoneNumber, message, args);

            expect(res).toEqual({});
            expect(dialPhoneNumber).toHaveBeenCalledTimes(1);
            expect(dialPhoneNumber).toHaveBeenCalledWith(expectedNumber);
            expect(joinCall).not.toHaveBeenCalled();
            expect(mockedDisplayGenericErrorModal).not.toHaveBeenCalled();
            expect(store.dispatch).not.toHaveBeenCalled();
        });
    });
});
