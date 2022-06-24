// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import styled from 'styled-components';
import {Droppable, DroppableProvided} from 'react-beautiful-dnd';

import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';
import {DateTime} from 'luxon';

import {
    Checklist,
    ChecklistItem,
    ChecklistItemsFilter,
    ChecklistItemState,
    emptyChecklistItem,
} from 'src/types/checklist';
import DraggableChecklistItem from 'src/components/checklist_item/checklist_item_draggable';
import {currentChecklistItemsFilter} from 'src/selectors';

// disable all react-beautiful-dnd development warnings
// @ts-ignore
window['__react-beautiful-dnd-disable-dev-warnings'] = true;

interface Props {
    extra?: any;
    referenceID?: string;
    disabled?: boolean;
    allowAddItem?: boolean;
    checklist: Checklist;
    checklistIndex: number;
    onUpdateChecklist: (newChecklist: Checklist) => void;
    onUpdateChecklistItem: (newItem: ChecklistItem, index: number) => void;
    onAddChecklistItem: (newItem: ChecklistItem) => void;
}

const GenericChecklist = (props: Props) => {
    const {formatMessage} = useIntl();
    const checklistItemsFilter = useSelector(currentChecklistItemsFilter);
    const myUser = useSelector(getCurrentUser);
    const [addingItem, setAddingItem] = useState(false);

    const showItem = (checklistItem: ChecklistItem, filter: ChecklistItemsFilter, myId: string) => {
        if (filter.all) {
            return true;
        }

        // "Show checked tasks" is not checked, so if item is checked (closed), don't show it.
        if (!filter.checked && checklistItem.state === ChecklistItemState.Closed) {
            return false;
        }

        // "Me" is not checked, so if assignee_id is me, don't show it.
        if (!filter.me && checklistItem.assignee_id === myId) {
            return false;
        }

        // "Unassigned" is not checked, so if assignee_id is blank (unassigned), don't show it.
        if (!filter.unassigned && checklistItem.assignee_id === '') {
            return false;
        }

        // "Others" is not checked, so if item has someone else as the assignee, don't show it.
        if (!filter.others && checklistItem.assignee_id !== '' && checklistItem.assignee_id !== myId) {
            return false;
        }

        // "Overdue" is checked
        if (filter.overdueOnly) {
            // if an item doesn't have a due date or is due in the future, don't show it.
            if (checklistItem.due_date === 0 || DateTime.fromMillis(checklistItem.due_date) > DateTime.now()) {
                return false;
            }

            // if an item is skipped or closed, don't show it.
            if (checklistItem.state === ChecklistItemState.Closed || checklistItem.state === ChecklistItemState.Skip) {
                return false;
            }
        }

        // We should show it!
        return true;
    };

    /*
    const onUpdateChecklistItem = (index: number, newItem: ChecklistItem) => {
        const newChecklistItems = [...props.checklist.items];
        newChecklistItems[index] = newItem;
        const newChecklist = {...props.checklist};
        newChecklist.items = newChecklistItems;
        props.onUpdateChecklist(newChecklist);
    };*/

    /*
    const onAddChecklistItem = (newItem: ChecklistItem) => {
        const newChecklistItems = [...props.checklist.items];
        newChecklistItems.push(newItem);
        const newChecklist = {...props.checklist};
        newChecklist.items = newChecklistItems;
        props.onUpdateChecklist(newChecklist);
    };*/

    const onDuplicateChecklistItem = (index: number) => {
        const newChecklistItems = [...props.checklist.items];
        const duplicate = {...newChecklistItems[index]};
        newChecklistItems.push(duplicate);
        const newChecklist = {...props.checklist};
        newChecklist.items = newChecklistItems;
        props.onUpdateChecklist(newChecklist);
    };

    const onDeleteChecklistItem = (index: number) => {
        const newChecklistItems = [...props.checklist.items];
        newChecklistItems.splice(index, 1);
        const newChecklist = {...props.checklist};
        newChecklist.items = newChecklistItems;
        props.onUpdateChecklist(newChecklist);
    };

    const keys = generateKeys(props.checklist.items.map((item) => props.referenceID + item.title));

    return (
        <Droppable
            droppableId={props.checklistIndex.toString()}
            direction='vertical'
            type='checklist-item'
        >
            {(droppableProvided: DroppableProvided) => (
                <ChecklistContainer className='checklist'>
                    <div
                        ref={droppableProvided.innerRef}
                        {...droppableProvided.droppableProps}
                    >
                        {props.checklist.items.map((checklistItem: ChecklistItem, index: number) => {
                            // filtering here because we need to maintain the index values
                            // because we refer to checklist items by their index
                            if (!showItem(checklistItem, checklistItemsFilter, myUser.id)) {
                                return null;
                            }

                            return (
                                <DraggableChecklistItem
                                    key={keys[index]}
                                    referenceID={props.referenceID}
                                    disabled={props.disabled}
                                    checklistIndex={props.checklistIndex}
                                    item={checklistItem}
                                    itemIndex={index}
                                    newItem={false}
                                    cancelAddingItem={() => {
                                        setAddingItem(false);
                                    }}
                                    onUpdateChecklistItem={(newItem: ChecklistItem) => props.onUpdateChecklistItem(newItem, index)}
                                    onDuplicateChecklistItem={() => onDuplicateChecklistItem(index)}
                                    onDeleteChecklistItem={() => onDeleteChecklistItem(index)}
                                />
                            );
                        })}
                        {addingItem &&
                            <DraggableChecklistItem
                                key={'new_checklist_item'}
                                referenceID={props.referenceID}
                                disabled={false}
                                checklistIndex={props.checklistIndex}
                                item={emptyChecklistItem()}
                                itemIndex={-1}
                                newItem={true}
                                cancelAddingItem={() => {
                                    setAddingItem(false);
                                }}
                                onAddChecklistItem={props.onAddChecklistItem}
                            />
                        }
                        {droppableProvided.placeholder}
                    </div>
                    {props.allowAddItem &&
                        <AddTaskLink
                            disabled={props.disabled}
                            onClick={() => {
                                setAddingItem(true);
                            }}
                            data-testid={`add-new-task-${props.checklistIndex}`}
                        >
                            <IconWrapper>
                                <i className='icon icon-plus'/>
                            </IconWrapper>
                            {formatMessage({defaultMessage: 'Add an item'})}
                        </AddTaskLink>
                    }
                </ChecklistContainer>
            )}
        </Droppable>
    );
};

const IconWrapper = styled.div`
    padding: 3px 0 0 1px;
    margin: 0;
`;

const ChecklistContainer = styled.div`
    background-color: var(--center-channel-bg);
    border-radius: 0 0 4px 4px;
    border:  1px solid rgba(var(--center-channel-color-rgb), 0.08);
    border-top: 0;
    padding: 8px 0px;
`;

const AddTaskLink = styled.button`
    font-size: 14px;
    font-weight: 400;
    line-height: 20px;
    height: 44px;
    width: 100%;

    background: none;
    border: none;

    border-radius: 8px;
    display: flex;
    flex-direction: row;
    align-items: center;
    cursor: pointer;

    color: var(--center-channel-color-64);

    &:hover:not(:disabled) {
        background-color: var(--button-bg-08);
        color: var(--button-bg);
    }
`;

export const generateKeys = (arr: string[]): string[] => {
    const keys: string[] = [];
    const itemsMap = new Map<string, number>();
    for (let i = 0; i < arr.length; i++) {
        const num = itemsMap.get(arr[i]) || 0;
        keys.push(arr[i] + String(num));
        itemsMap.set(arr[i], num + 1);
    }
    return keys;
};

export default GenericChecklist;
