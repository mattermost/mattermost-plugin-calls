// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import {useUpdateEffect} from 'react-use';
import {useIntl} from 'react-intl';
import styled, {css} from 'styled-components';
import {DraggableProvided} from 'react-beautiful-dnd';
import {UserProfile} from '@mattermost/types/users';

import {DateTimeOption} from 'src/components/datetime_selector';

import {ChecklistItem as ChecklistItemType, ChecklistItemState} from 'src/types/checklist';

import Portal from 'src/components/portal';

import {Mode} from '../datetime_input';

import ChecklistItemHoverMenu, {HoverMenu} from './hover_menu';
import ChecklistItemDescription from './description';
import ChecklistItemTitle from './title';
import AssignTo from './assign_to';

//import Command from './command';
import {CheckBoxButton, CancelSaveButtons} from './inputs';
import {DueDateButton} from './duedate';

interface ChecklistItemProps {
    checklistItem: ChecklistItemType;
    checklistNum: number;
    itemNum: number;
    referenceID?: string;
    draggableProvided?: DraggableProvided;
    dragging: boolean;
    disabled: boolean;
    collapsibleDescription: boolean;
    newItem: boolean;
    renderAssignee?: boolean;
    cancelAddingItem?: () => void;
    onUpdateChecklistItem?: (newItem: ChecklistItemType, referenceID?: string) => void;
    onAddChecklistItem?: (newItem: ChecklistItemType, referenceID?: string) => void;
    onDuplicateChecklistItem?: (referenceID?: string) => void;
    onDeleteChecklistItem?: (referenceID?: string) => void;
}

export const ChecklistItem = (props: ChecklistItemProps): React.ReactElement => {
    const {formatMessage} = useIntl();
    const {referenceID, onUpdateChecklistItem, onAddChecklistItem, renderAssignee} = props;
    const [showDescription, setShowDescription] = useState(true);
    const [isEditing, setIsEditing] = useState(props.newItem);
    const [titleValue, setTitleValue] = useState(props.checklistItem.title);
    const [descValue, setDescValue] = useState(props.checklistItem.description);
    const [command, setCommand] = useState(props.checklistItem.command);
    const [assigneeID, setAssigneeID] = useState(props.checklistItem.assignee_id);
    const [dueDate, setDueDate] = useState(props.checklistItem.due_date);

    const [showMenu, setShowMenu] = useState(false);

    const toggleDescription = () => setShowDescription(!showDescription);

    useUpdateEffect(() => {
        setAssigneeID(props.checklistItem.assignee_id);
        setCommand(props.checklistItem.command);
        setDueDate(props.checklistItem.due_date);
    }, [props.checklistItem]);

    const onStateChange = async (state: ChecklistItemState) => {
        if (props.newItem) {
            return;
        }
        const newItem = {...props.checklistItem};
        newItem.state = state;
        onUpdateChecklistItem?.(newItem, referenceID);
    };

    const onAssigneeChange = async (userType?: string, user?: UserProfile) => {
        setShowMenu(false);
        const userId = user?.id || '';
        setAssigneeID(userId);
        if (props.newItem) {
            return;
        }
        const newItem = {...props.checklistItem};
        newItem.assignee_id = userId;
        onUpdateChecklistItem?.(newItem, referenceID);
    };

    const onDueDateChange = async (value?: DateTimeOption | undefined | null) => {
        setShowMenu(false);
        let timestamp = 0;
        if (value?.value) {
            timestamp = value?.value.toMillis();
        }
        setDueDate(timestamp);
        if (props.newItem) {
            return;
        }
        const newItem = {...props.checklistItem};
        newItem.due_date = timestamp;
        onUpdateChecklistItem?.(newItem, referenceID);
    };

    const onCommandChange = async (newCommand: string) => {
        setShowMenu(false);
        setCommand(newCommand);
        if (props.newItem) {
            return;
        }
        const newItem = {...props.checklistItem};
        newItem.command = newCommand;
        onUpdateChecklistItem?.(newItem, referenceID);
    };

    const renderAssignTo = (): null | React.ReactNode => {
        if (!assigneeID && !isEditing) {
            return null;
        }

        // render only in the RHS
        if (!renderAssignee) {
            return null;
        }

        const shouldHideName = () => {
            if (isEditing) {
                return false;
            }
            if (command !== '') {
                return true;
            }
            const notFinished = [ChecklistItemState.Open, ChecklistItemState.InProgress].includes(props.checklistItem.state as ChecklistItemState);
            if (dueDate > 0 && notFinished) {
                return true;
            }
            return false;
        };

        return (
            <AssignTo
                assignee_id={assigneeID || ''}
                editable={!props.disabled}
                withoutName={shouldHideName()}
                onSelectedChange={onAssigneeChange}
            />
        );
    };

    /*
    const renderCommand = (): null | React.ReactNode => {
        if (!command && !isEditing) {
            return null;
        }
        return (
            <Command
                checklistNum={props.checklistNum}
                command={command}
                command_last_run={props.checklistItem.command_last_run}
                disabled={props.disabled}
                itemNum={props.itemNum}
                referenceID={referenceID}
                isEditing={isEditing}
                onChangeCommand={onCommandChange}
            />
        );
    };
    */

    const renderDueDate = (): null | React.ReactNode => {
        const isTaskOpenOrInProgress = props.checklistItem.state === ChecklistItemState.Open || props.checklistItem.state === ChecklistItemState.InProgress;
        if ((!dueDate || !isTaskOpenOrInProgress) && !isEditing) {
            return null;
        }

        return (
            <DueDateButton
                editable={!props.disabled}
                date={dueDate}
                mode={referenceID ? Mode.DateTimeValue : Mode.DurationValue}
                onSelectedChange={onDueDateChange}
            />
        );
    };

    const renderRow = (): null | React.ReactNode => {
        if (!assigneeID && !command && !dueDate && !isEditing) {
            return null;
        }
        return (
            <Row>
                {renderAssignTo()}
                {renderDueDate()}
            </Row>
        );
    };

    const content = (
        <ItemContainer
            ref={props.draggableProvided?.innerRef}
            {...props.draggableProvided?.draggableProps}
            data-testid='checkbox-item-container'
            editing={isEditing}
            $disabled={props.disabled}
        >
            <CheckboxContainer>
                {!props.disabled && !props.dragging &&
                    <ChecklistItemHoverMenu
                        referenceID={referenceID}
                        renderAssignee={renderAssignee}
                        checklistNum={props.checklistNum}
                        itemNum={props.itemNum}
                        isSkipped={props.checklistItem.state === ChecklistItemState.Skip}
                        onEdit={() => setIsEditing(true)}
                        isEditing={isEditing}
                        onChange={onStateChange}
                        description={props.checklistItem.description}
                        showDescription={showDescription}
                        toggleDescription={toggleDescription}
                        assignee_id={assigneeID || ''}
                        onAssigneeChange={onAssigneeChange}
                        due_date={props.checklistItem.due_date}
                        onDueDateChange={onDueDateChange}
                        onDuplicateChecklistItem={props.onDuplicateChecklistItem}
                        onDeleteChecklistItem={props.onDeleteChecklistItem}
                    />
                }
                <DragButton
                    title={formatMessage({defaultMessage: 'Drag me to reorder'})}
                    className={'icon icon-drag-vertical'}
                    {...props.draggableProvided?.dragHandleProps}
                    isVisible={!props.disabled}
                    isDragging={props.dragging}
                />
                <CheckBoxButton
                    disabled={props.disabled || props.checklistItem.state === ChecklistItemState.Skip}
                    item={props.checklistItem}
                    onChange={onStateChange}
                />
                <ChecklistItemTitleWrapper
                    onClick={() => props.collapsibleDescription && props.checklistItem.description !== '' && toggleDescription()}
                >
                    <ChecklistItemTitle
                        editingItem={isEditing}
                        onEdit={setTitleValue}
                        value={titleValue}
                        skipped={props.checklistItem.state === ChecklistItemState.Skip}
                        clickable={props.collapsibleDescription && props.checklistItem.description !== ''}
                    />
                </ChecklistItemTitleWrapper>
            </CheckboxContainer>
            {(descValue || isEditing) &&
                <ChecklistItemDescription
                    editingItem={isEditing}
                    showDescription={showDescription}
                    onEdit={setDescValue}
                    value={descValue}
                />
            }
            {renderRow()}
            {isEditing &&
                <CancelSaveButtons
                    onCancel={() => {
                        setShowMenu(false);
                        setIsEditing(false);
                        setTitleValue(props.checklistItem.title);
                        setDescValue(props.checklistItem.description);
                        props.cancelAddingItem?.();
                    }}
                    onSave={() => {
                        setShowMenu(false);
                        setIsEditing(false);
                        if (props.newItem) {
                            props.cancelAddingItem?.();
                            const newItem = {
                                id: '',
                                title: titleValue,
                                command,
                                description: descValue,
                                state: ChecklistItemState.Open,
                                command_last_run: 0,
                                due_date: dueDate,
                                assignee_id: assigneeID,
                            };
                            onAddChecklistItem?.(newItem, referenceID);
                        } else {
                            const newItem = {...props.checklistItem};
                            newItem.title = titleValue;
                            newItem.command = command;
                            newItem.description = descValue;
                            onUpdateChecklistItem?.(newItem, referenceID);
                        }
                    }}
                />
            }
        </ItemContainer>
    );

    if (props.dragging) {
        return <Portal>{content}</Portal>;
    }

    return content;
};

export const CheckboxContainer = styled.div`
    align-items: flex-start;
    display: flex;
    position: relative;

    button {
        width: 53px;
        height: 29px;
        border: 1px solid #166DE0;
        box-sizing: border-box;
        border-radius: 4px;
        font-family: Open Sans;
        font-style: normal;
        font-weight: 600;
        font-size: 12px;
        line-height: 17px;
        text-align: center;
        background: #ffffff;
        color: #166DE0;
        cursor: pointer;
        margin-right: 13px;
    }

    button:disabled {
        border: 0px;
        color: var(--button-color);
        background: rgba(var(--center-channel-color-rgb), 0.56);
        cursor: default;
    }

    &:hover {
        .checkbox-container__close {
            opacity: 1;
        }
    }

    .icon-bars {
        padding: 0 0.8rem 0 0;
    }

    input[type="checkbox"] {
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        background: #ffffff;
        margin: 0;
        cursor: pointer;
        margin-right: 8px;
        margin-top: 2px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        min-width: 16px;
        height: 16px;
        border: 1px solid rgba(var(--center-channel-color-rgb), 0.24);
        box-sizing: border-box;
        border-radius: 2px;
    }

    input[type="checkbox"]:checked {
        background: var(--button-bg);
        border: 1px solid var(--button-bg);
        box-sizing: border-box;
    }

    input[type="checkbox"]::before {
        font-family: 'compass-icons', mattermosticons;
        text-rendering: auto;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        content: "\f012c";
        font-size: 12px;
        font-weight: bold;
        color: #ffffff;
        transition: transform 0.15s;
        transform: scale(0) rotate(90deg);
        position: relative;
    }

    input[type="checkbox"]:checked::before {
        transform: scale(1) rotate(0deg);
    }

    input[type="checkbox"]:disabled {
        opacity: 0.38;
    }

    label {
        font-weight: normal;
        word-break: break-word;
        display: inline;
        margin: 0;
        margin-right: 8px;
        flex-grow: 1;
    }
`;

const ChecklistItemTitleWrapper = styled.div`
    display: flex;
    flex-direction: column;
    width: 100%;
`;

const DragButton = styled.i<{isVisible: boolean, isDragging: boolean}>`
    cursor: pointer;
    width: 4px;
    margin-right: 4px;
    margin-left: 4px;
    margin-top: 1px;
    color: rgba(var(--center-channel-color-rgb), 0.56);
    opacity: 0;
    ${({isVisible}) => !isVisible && css`
        visibility: hidden;
    `}
    ${({isDragging}) => isDragging && css`
        opacity: 1;
    `}
`;

const Row = styled.div`
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 8px;
    row-gap: 5px;

    margin-left: 35px;
    margin-top: 8px;
`;

const ItemContainer = styled.div<{editing: boolean, $disabled: boolean}>`
    margin-bottom: 4px;
    padding: 8px 0px;

    ${HoverMenu} {
        opacity: 0;
    }

    .checklists:not(.isDragging) & {
        // not dragging and hover or focus-within
        &:hover,
        &:focus-within {
            ${DragButton},
            ${HoverMenu} {
                opacity: 1;
            }
        }
    }

    ${({editing}) => editing && css`
        background-color: var(--button-bg-08);
    `}

    ${({editing, $disabled}) => !editing && !$disabled && css`
        .checklists:not(.isDragging) &:hover {
            background: var(--center-channel-color-04);
        }
    `}
`;
