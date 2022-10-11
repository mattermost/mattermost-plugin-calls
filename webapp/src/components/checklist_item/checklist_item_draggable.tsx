// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {Draggable, DraggableProvided, DraggableStateSnapshot} from 'react-beautiful-dnd';

import {ChecklistItem as ChecklistItemType, ChecklistItemState} from 'src/types/checklist';

import {ChecklistItem} from 'src/components/checklist_item/checklist_item';

interface Props {
    extra?: any;
    referenceID?: string;
    checklistIndex: number;
    item: ChecklistItemType;
    itemIndex: number;
    newItem: boolean;
    disabled?: boolean;
    cancelAddingItem: () => void;
    onUpdateChecklistItem?: (newItem: ChecklistItemType, referenceID?: string) => void;
    onAddChecklistItem?: (newItem: ChecklistItemType, referenceID?: string) => void;
    onDeleteChecklistItem?: (referenceID?: string) => void;
}

const DraggableChecklistItem = (props: Props) => {
    return (
        <Draggable
            draggableId={props.item.title + props.itemIndex}
            index={props.itemIndex}
        >
            {(draggableProvided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                <ChecklistItem
                    checklistItem={props.item}
                    checklistNum={props.checklistIndex}
                    itemNum={props.itemIndex}
                    referenceID={props.referenceID}
                    draggableProvided={draggableProvided}
                    dragging={snapshot.isDragging || snapshot.combineWith != null}
                    disabled={props.disabled || false}
                    collapsibleDescription={true}
                    newItem={props.newItem}
                    cancelAddingItem={props.cancelAddingItem}
                    onUpdateChecklistItem={props.onUpdateChecklistItem}
                    onAddChecklistItem={props.onAddChecklistItem}
                    onDeleteChecklistItem={props.onDeleteChecklistItem}
                />
            )}
        </Draggable>
    );
};

export default DraggableChecklistItem;
