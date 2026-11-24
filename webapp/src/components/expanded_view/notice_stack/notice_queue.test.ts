// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {addNotice, markLeaving, MAX_NOTICES, removeNotice, StackNotice} from './notice_queue';

const notice = (id: string, transient = true): StackNotice => ({id, kind: 'joined', message: id, transient, leaving: false});

describe('notice queue', () => {
    test('adds the newest notice at the bottom', () => {
        const notices = addNotice([notice('a')], notice('b'));

        expect(notices.map((n) => n.id)).toEqual(['a', 'b']);
    });

    test(`keeps at most ${MAX_NOTICES} notices, dropping the oldest`, () => {
        let notices: StackNotice[] = [];
        ['a', 'b', 'c', 'd', 'e', 'f'].forEach((id) => {
            notices = addNotice(notices, notice(id));
        });

        expect(notices.map((n) => n.id)).toEqual(['b', 'c', 'd', 'e', 'f']);
    });

    test('drops the oldest transient notice before a lasting one', () => {
        let notices = [notice('lasting', false), notice('a'), notice('b'), notice('c'), notice('d')];
        notices = addNotice(notices, notice('e'));

        expect(notices.map((n) => n.id)).toEqual(['lasting', 'b', 'c', 'd', 'e']);
    });

    test('drops the oldest notice when none are transient', () => {
        const notices = addNotice([notice('a', false), notice('b', false)], notice('c', false), 2);

        expect(notices.map((n) => n.id)).toEqual(['b', 'c']);
    });

    test('marks a notice as leaving, then removes it', () => {
        const leaving = markLeaving([notice('a'), notice('b')], 'a');
        expect(leaving.map((n) => n.leaving)).toEqual([true, false]);

        expect(removeNotice(leaving, 'a').map((n) => n.id)).toEqual(['b']);
    });
});
