/* eslint-disable max-lines */

import React, {useEffect, useState} from 'react';

import ChecklistList from 'src/components/checklist/checklist_list';
import {addAgendaItem, deleteItem, fetchAgendaForChannel, reorderItems, updateAgendaItem} from 'src/rest_client';

import {Checklist, ChecklistItem, emptyChecklist} from 'src/types/checklist';

interface Props {
    channelId: string,
}

const Agenda = ({channelId}: Props) => {
    const [checklist, setChecklist] = useState(emptyChecklist());

    useEffect(() => {
        async function getAgenda() {
            const agenda = await fetchAgendaForChannel(channelId) || emptyChecklist();
            setChecklist(agenda);
        }

        getAgenda();
    }, [channelId]);

    const onUpdateChecklistItem = async (newItem: ChecklistItem, index: number) => {
        const item = await updateAgendaItem(channelId, newItem);
        if (!item) {
            return;
        }
        const newChecklistItems = [...checklist.items];
        newChecklistItems[index] = item;
        const newChecklist = {...checklist};
        newChecklist.items = newChecklistItems;
        setChecklist(newChecklist);
    };

    const onAddChecklistItem = async (newItem: ChecklistItem) => {
        const itemWithId = await addAgendaItem(channelId, newItem);

        const newChecklistItems = [...checklist.items];
        newChecklistItems.push(itemWithId);
        const newChecklist = {...checklist};
        newChecklist.items = newChecklistItems;
        setChecklist(newChecklist);
    };

    const onChecklistReordered = async (newChecklist: Checklist) => {
        const ids = newChecklist.items.map((i) => i.id);

        const success = await reorderItems(channelId, ids);
        if (success) {
            setChecklist(newChecklist);
        }
    };

    const onDeleteChecklistItem = async (id: string, newChecklist: Checklist) => {
        const success = await deleteItem(channelId, id);
        if (success) {
            setChecklist(newChecklist);
        }
    };

    return (
        <ChecklistList
            checklists={[checklist]}
            onChecklistsUpdated={(newChecklists) => onChecklistReordered(newChecklists[0])}
            onUpdateChecklistItem={onUpdateChecklistItem}
            onAddChecklistItem={onAddChecklistItem}
            onDeleteChecklistItem={onDeleteChecklistItem}
        />
    );
};

export default Agenda;
