// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Post} from '@mattermost/types/posts';
import type {UserProfile} from '@mattermost/types/users';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {createIntl, RawIntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import type CallClient from 'src/clients/call';
import {dialFromUI, phoneDialingSupported} from 'src/phone_call';
import {mockStore} from 'src/testUtils';
import {CallPostStatus} from 'src/types/types';

import {PostTypeEvent} from './post_type_event';
import {getPhoneCardState, PhoneCardState} from './post_type_phone_call';

jest.mock('src/phone_call', () => ({
    dialFromUI: jest.fn(),
    phoneDialingSupported: jest.fn(() => true),
}));

jest.mock('src/actions', () => ({
    loadProfilesByIdsIfMissing: jest.fn(() => ({type: 'mock/loadProfilesByIdsIfMissing'})),
}));

const mockedDialFromUI = dialFromUI as jest.Mock;
const mockedPhoneDialingSupported = phoneDialingSupported as jest.Mock;

const intl = createIntl({locale: 'en', messages: {}});

const CALLER_ID = 'user-id';
const TARGET_ID = 'other-user';
const BOT_DM_ID = 'bot-dm';

const callerProfile = {id: CALLER_ID, username: 'me'} as UserProfile;
const targetProfile = {id: TARGET_ID, username: 'leonard', first_name: 'Leonard', last_name: 'Riley'} as UserProfile;

type PostOptions = {
    props?: Record<string, unknown>;
    userID?: string;
    channelID?: string;
};

const START_AT = 1_700_000_000_000;

const phonePost = ({props = {}, userID = CALLER_ID, channelID = BOT_DM_ID}: PostOptions = {}) => ({
    id: 'post-id',
    user_id: userID,
    channel_id: channelID,
    type: 'custom_calls',
    props: {
        call_type: 'phone',
        phone_number: '+13125550174',
        display_number: '312-555-0174',
        display_label: 'DSN',
        target_user_id: TARGET_ID,
        start_at: START_AT,
        end_at: 0,
        call_status: CallPostStatus.Calling,
        ...props,
    },
} as unknown as Post);

type StateOptions = {
    currentUserID?: string;
    answeredAt?: number;
    inCall?: boolean;
    withTargetProfile?: boolean;
};

const buildState = ({currentUserID = CALLER_ID, answeredAt = 0, inCall = false, withTargetProfile = true}: StateOptions = {}) => ({
    'plugins-com.mattermost.calls': {
        calls: {
            [BOT_DM_ID]: {
                ID: 'call-id',
                channelID: BOT_DM_ID,
                startAt: START_AT,
                ownerID: CALLER_ID,
                phone: {number: '+13125550174', displayNumber: '312-555-0174', label: 'DSN', targetUserID: TARGET_ID},
            },
        },
        sessions: {
            [BOT_DM_ID]: {
                'session-1': {session_id: 'session-1', user_id: CALLER_ID, unmuted: true, raised_hand: 0},
            },
        },
        sipCallStates: answeredAt ? {[BOT_DM_ID]: {status: 'active', answeredAt}} : {},
        clientStateReducer: inCall ? {channelID: BOT_DM_ID, sessionID: 'session-1'} : null,
        hosts: {},
        callsConfig: {MaxCallParticipants: 0},
    },
    entities: {
        general: {config: {}, license: {}},
        cloud: {subscription: undefined},
        channels: {channels: {}},
        preferences: {myPreferences: {}},
        users: {
            currentUserId: currentUserID,
            profiles: {
                [CALLER_ID]: callerProfile,
                ...(withTargetProfile && {[TARGET_ID]: targetProfile}),
            },
        },
    },
});

const renderCard = (post: Post, state = buildState()) => {
    const store = mockStore(state);
    return render(
        <Provider store={store}>
            <RawIntlProvider value={intl}>
                <PostTypeEvent
                    post={post}
                    isRHS={false}
                />
            </RawIntlProvider>
        </Provider>,
    );
};

const title = () => screen.getByTestId('phone-call-card-title');
const subtitle = () => screen.getByTestId('phone-call-card-subtitle');

describe('getPhoneCardState', () => {
    const callProps = (overrides: Record<string, unknown>) => ({
        title: '',
        start_at: START_AT,
        end_at: 0,
        recordings: {},
        transcriptions: {},
        participants: [],
        call_status: CallPostStatus.Calling,
        ...overrides,
    });

    it('is calling until the phone picks up', () => {
        expect(getPhoneCardState(callProps({}), 0)).toBe(PhoneCardState.Calling);
    });

    it('is active once the phone picks up', () => {
        expect(getPhoneCardState(callProps({}), START_AT + 5000)).toBe(PhoneCardState.Active);
    });

    it.each([
        [CallPostStatus.Ended, PhoneCardState.Ended],
        [CallPostStatus.NoAnswer, PhoneCardState.NoAnswer],
        [CallPostStatus.Canceled, PhoneCardState.Canceled],
        [CallPostStatus.Declined, PhoneCardState.Declined],
        [CallPostStatus.Failed, PhoneCardState.Failed],
        ['', PhoneCardState.Ended],
    ])('reads the %s status off an ended post as %s', (status, expected) => {
        expect(getPhoneCardState(callProps({end_at: START_AT + 60_000, call_status: status}), START_AT + 5000)).toBe(expected);
    });
});

describe('PostTypePhoneCall', () => {
    let disconnect: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockedPhoneDialingSupported.mockReturnValue(true);
        disconnect = jest.fn();
        window.callsClient = {disconnect} as unknown as CallClient;
    });

    afterEach(() => {
        window.callsClient = undefined;
    });

    it('renders through PostTypeEvent for a phone call post', () => {
        renderCard(phonePost());

        expect(screen.getByTestId('phone-call-card')).toBeInTheDocument();
        expect(screen.queryByTestId('call-thread')).not.toBeInTheDocument();
    });

    it('leaves channel calls to the regular card', () => {
        renderCard(phonePost({props: {call_type: undefined}}));

        expect(screen.queryByTestId('phone-call-card')).not.toBeInTheDocument();
        expect(screen.getByTestId('call-thread')).toBeInTheDocument();
    });

    describe('while calling', () => {
        it('shows who is being called with the number and label, and no button', () => {
            renderCard(phonePost(), buildState({inCall: true}));

            expect(title()).toHaveTextContent('Calling Leonard Riley…');
            expect(subtitle()).toHaveTextContent(/ago\s*•\s*312-555-0174\s*•\s*DSN$/);
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
        });

        it('falls back to the number when the person called is unknown', () => {
            renderCard(phonePost({props: {target_user_id: undefined}}));

            expect(title()).toHaveTextContent('Calling 312-555-0174…');
        });

        it('leaves out the label when there is none', () => {
            renderCard(phonePost({props: {display_label: undefined}}));

            expect(subtitle()).toHaveTextContent(/ago\s*•\s*312-555-0174$/);
        });
    });

    describe('once answered', () => {
        it('shows the call as started with avatars and a Hang up button for the caller in the call', async () => {
            renderCard(phonePost(), buildState({answeredAt: START_AT + 5000, inCall: true}));

            expect(title()).toHaveTextContent(/^Call started$/);
            expect(subtitle()).toHaveTextContent(/312-555-0174\s*•\s*DSN$/);

            const hangUp = screen.getByRole('button', {name: 'Hang up'});
            await userEvent.click(hangUp);
            expect(disconnect).toHaveBeenCalled();
        });

        it('offers no Hang up when this window is not in the call', () => {
            renderCard(phonePost(), buildState({answeredAt: START_AT + 5000, inCall: false}));

            expect(title()).toHaveTextContent(/^Call started$/);
            expect(screen.queryByRole('button', {name: 'Hang up'})).not.toBeInTheDocument();
        });
    });

    describe('once ended', () => {
        const endedPost = (status: CallPostStatus | '', extra: Record<string, unknown> = {}) =>
            phonePost({props: {end_at: START_AT + 90_000, call_status: status, ...extra}});

        it('shows when the call ended and how long it lasted', () => {
            renderCard(endedPost(CallPostStatus.Ended));

            expect(title()).toHaveTextContent(/^Call ended$/);
            expect(subtitle()).toHaveTextContent(/^Ended at .+\s*•\s*Lasted 1 minute$/);
        });

        it('shows the number when an ended call has no start time', () => {
            renderCard(endedPost(CallPostStatus.Ended, {start_at: 0}));

            expect(subtitle()).toHaveTextContent(/^312-555-0174\s*•\s*DSN$/);
        });

        it.each([
            {status: CallPostStatus.Canceled, callerTitle: 'Call canceled', calleeTitle: 'Missed call'},
            {status: CallPostStatus.NoAnswer, callerTitle: 'No answer', calleeTitle: 'Missed call'},
        ])('tells the caller $callerTitle and the person called $calleeTitle for $status', ({status, callerTitle, calleeTitle}) => {
            const {unmount} = renderCard(endedPost(status));
            expect(title()).toHaveTextContent(new RegExp(`^${callerTitle}$`));
            unmount();

            renderCard(endedPost(status), buildState({currentUserID: TARGET_ID}));
            expect(title()).toHaveTextContent(new RegExp(`^${calleeTitle}$`));
        });

        it('shows the number under a call nobody answered', () => {
            renderCard(endedPost(CallPostStatus.NoAnswer));

            expect(subtitle()).toHaveTextContent(/^312-555-0174\s*•\s*DSN$/);
        });

        it.each([
            {status: CallPostStatus.Declined, expected: 'Call declined'},
            {status: CallPostStatus.Failed, expected: 'Call failed'},
        ])('shows $expected', ({status, expected}) => {
            renderCard(endedPost(status));

            expect(title()).toHaveTextContent(new RegExp(`^${expected}$`));
            expect(subtitle()).toHaveTextContent(/^312-555-0174\s*•\s*DSN$/);
        });

        it('lets the caller call the same number again', async () => {
            renderCard(endedPost(CallPostStatus.NoAnswer));

            await userEvent.click(screen.getByRole('button', {name: 'Call again'}));

            expect(mockedDialFromUI).toHaveBeenCalledWith('+13125550174', {targetUserID: TARGET_ID, label: 'DSN'});
        });

        it('does not offer the person called a way to call the number back', () => {
            renderCard(endedPost(CallPostStatus.NoAnswer), buildState({currentUserID: TARGET_ID}));

            expect(screen.queryByRole('button', {name: 'Call again'})).not.toBeInTheDocument();
        });

        it('does not offer Call again where this window cannot dial', () => {
            mockedPhoneDialingSupported.mockReturnValue(false);

            renderCard(endedPost(CallPostStatus.Ended));

            expect(screen.queryByRole('button', {name: 'Call again'})).not.toBeInTheDocument();
        });

        it('does not offer Call again while the call is still going', () => {
            renderCard(phonePost(), buildState({answeredAt: START_AT + 5000, inCall: true}));

            expect(screen.queryByRole('button', {name: 'Call again'})).not.toBeInTheDocument();
        });

        it('counts recordings and transcriptions', () => {
            renderCard(endedPost(CallPostStatus.Ended, {
                recordings: {
                    rec1: {file_id: 'file-1', post_id: 'p1', tr_id: '', rec_id: 'rec1'},
                    rec2: {file_id: 'file-2', post_id: 'p2', tr_id: '', rec_id: 'rec2'},
                },
                transcriptions: {
                    tr1: {file_id: 'file-3', post_id: 'p3', tr_id: 'tr1', rec_id: 'rec1'},
                },
            }));

            expect(screen.getByText('2 recordings')).toBeInTheDocument();
            expect(screen.getByText('1 transcription')).toBeInTheDocument();
        });
    });
});
