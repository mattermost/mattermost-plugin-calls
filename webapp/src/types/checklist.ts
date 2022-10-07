// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export interface Checklist {
    title: string;
    items: ChecklistItem[];
}

export enum ChecklistItemState {
    Open = '',
    InProgress = 'in_progress',
    Closed = 'closed',
    Skip = 'skipped',
}

export interface ChecklistItem {
    id: string;
    title: string;
    description: string;
    state: ChecklistItemState | string;
    state_modified?: number;
    assignee_id?: string;
    assignee_modified?: number;
    command: string;
    command_last_run: number;
    due_date: number;
}

export interface ChecklistItemsFilter extends Record<string, boolean> {
    all: boolean;
    checked: boolean;
    me: boolean;
    unassigned: boolean;
    others: boolean;
    overdueOnly: boolean;
}

export const ChecklistItemsFilterDefault: ChecklistItemsFilter = {
    all: false,
    checked: true,
    me: true,
    unassigned: true,
    others: true,
    overdueOnly: false,
};

export function emptyChecklist(): Checklist {
    return {
        title: '',
        items: [],
    };
}

export function emptyChecklistItem(): ChecklistItem {
    return {
        id: '',
        title: '',
        state: ChecklistItemState.Open,
        command: '',
        description: '',
        command_last_run: 0,
        due_date: 0,
    };
}

export const newChecklistItem = (id = '', title = '', description = '', command = '', state = ChecklistItemState.Open): ChecklistItem => ({
    id,
    title,
    description,
    command,
    command_last_run: 0,
    state,
    due_date: 0,
});
