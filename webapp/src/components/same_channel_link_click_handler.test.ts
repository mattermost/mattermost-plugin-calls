// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {makeSameChannelLinkClickHandler} from './same_channel_link_click_handler';

// Helpers ——————————————————————————————————————————————————————————————————

const TEAM = 'team-1';
const CHANNEL_ID = 'town-square-id';
const CHANNEL_NAME = 'town-square';
const ORIGIN = window.location.origin; // matches jest testURL (http://localhost:8065)

const makeHandler = (overrides: {
    teamName?: string | null;
    channelId?: string;
    channelName?: string;
    onJoinCall?: jest.Mock;
} = {}) => {
    const onJoinCall = overrides.onJoinCall ?? jest.fn();
    const handler = makeSameChannelLinkClickHandler(
        () => overrides.teamName === null ? '' : (overrides.teamName ?? TEAM),
        () => overrides.channelId ?? CHANNEL_ID,
        () => overrides.channelName ?? CHANNEL_NAME,
        onJoinCall,
    );
    return {handler, onJoinCall};
};

const makeLink = (href: string, target?: string): HTMLAnchorElement => {
    const link = document.createElement('a');
    link.setAttribute('href', href);
    if (target) {
        link.target = target;
    }
    return link;
};

const makeEvent = (
    link: HTMLAnchorElement,
    opts: Partial<Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>> = {},
): MouseEvent => ({
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: link,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    stopImmediatePropagation: jest.fn(),
    ...opts,
} as unknown as MouseEvent);

const joinCallHref = (opts: {team?: string; channel?: string; origin?: string} = {}) => {
    const origin = opts.origin ?? ORIGIN;
    const team = opts.team ?? TEAM;
    const channel = opts.channel ?? CHANNEL_ID;
    return `${origin}/${team}/channels/${channel}?join_call=true`;
};

// Tests ————————————————————————————————————————————————————————————————————

describe('makeSameChannelLinkClickHandler', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        (window as Window & {basename: string}).basename = '';
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('calls joinCall for a same-channel join_call link matched by channel ID', () => {
        const {handler, onJoinCall} = makeHandler();
        const link = makeLink(joinCallHref());
        handler(makeEvent(link));

        expect(onJoinCall).not.toHaveBeenCalled(); // deferred
        jest.runAllTimers();
        expect(onJoinCall).toHaveBeenCalledTimes(1);
        expect(onJoinCall).toHaveBeenCalledWith(CHANNEL_ID);
    });

    it('calls joinCall for a same-channel join_call link matched by channel name', () => {
        const {handler, onJoinCall} = makeHandler();
        const link = makeLink(joinCallHref({channel: CHANNEL_NAME}));
        handler(makeEvent(link));

        jest.runAllTimers();
        expect(onJoinCall).toHaveBeenCalledTimes(1);
        expect(onJoinCall).toHaveBeenCalledWith(CHANNEL_ID);
    });

    it('joinCall is deferred via setTimeout, not called synchronously', () => {
        const {handler, onJoinCall} = makeHandler();
        const link = makeLink(joinCallHref());
        handler(makeEvent(link));

        expect(onJoinCall).not.toHaveBeenCalled();
        jest.runAllTimers();
        expect(onJoinCall).toHaveBeenCalledTimes(1);
    });

    it.each([
        {modifier: 'metaKey'},
        {modifier: 'ctrlKey'},
        {modifier: 'shiftKey'},
        {modifier: 'altKey'},
    ])('does not intercept $modifier click', ({modifier}) => {
        const {handler, onJoinCall} = makeHandler();
        const link = makeLink(joinCallHref());
        handler(makeEvent(link, {[modifier]: true}));

        jest.runAllTimers();
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('does not intercept non-primary button click', () => {
        const {handler, onJoinCall} = makeHandler();
        const link = makeLink(joinCallHref());
        handler(makeEvent(link, {button: 1}));

        jest.runAllTimers();
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('does not intercept link with target="_blank"', () => {
        const {handler, onJoinCall} = makeHandler();
        const link = makeLink(joinCallHref(), '_blank');
        handler(makeEvent(link));

        jest.runAllTimers();
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('does not intercept cross-origin link', () => {
        const {handler, onJoinCall} = makeHandler();
        const link = makeLink(joinCallHref({origin: 'https://attacker.com'}));
        handler(makeEvent(link));

        jest.runAllTimers();
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('does not intercept cross-team link', () => {
        const {handler, onJoinCall} = makeHandler();
        const link = makeLink(joinCallHref({team: 'other-team'}));
        handler(makeEvent(link));

        jest.runAllTimers();
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('does not intercept when no current team', () => {
        const {handler, onJoinCall} = makeHandler({teamName: null});
        const link = makeLink(joinCallHref());
        handler(makeEvent(link));

        jest.runAllTimers();
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('does not intercept link pointing to a different channel', () => {
        const {handler, onJoinCall} = makeHandler();
        const link = makeLink(joinCallHref({channel: 'off-topic-id'}));
        handler(makeEvent(link));

        jest.runAllTimers();
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('does not intercept link without join_call param', () => {
        const {handler, onJoinCall} = makeHandler();
        const link = makeLink(`${ORIGIN}/${TEAM}/channels/${CHANNEL_ID}`);
        handler(makeEvent(link));

        jest.runAllTimers();
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('does not intercept DM/messages URL', () => {
        const {handler, onJoinCall} = makeHandler();
        const link = makeLink(`${ORIGIN}/${TEAM}/messages/@somebody?join_call=true`);
        handler(makeEvent(link));

        jest.runAllTimers();
        expect(onJoinCall).not.toHaveBeenCalled();
    });

    it('strips window.basename before matching team segment on subpath deployments', () => {
        (window as Window & {basename?: string}).basename = '/mattermost';
        const {handler, onJoinCall} = makeHandler();
        const link = makeLink(`${ORIGIN}/mattermost/${TEAM}/channels/${CHANNEL_ID}?join_call=true`);
        handler(makeEvent(link));

        jest.runAllTimers();
        expect(onJoinCall).toHaveBeenCalledTimes(1);
        expect(onJoinCall).toHaveBeenCalledWith(CHANNEL_ID);
    });

    it('works correctly when no basename is set', () => {
        const {handler, onJoinCall} = makeHandler();
        const link = makeLink(joinCallHref());
        handler(makeEvent(link));

        jest.runAllTimers();
        expect(onJoinCall).toHaveBeenCalledTimes(1);
    });
});
