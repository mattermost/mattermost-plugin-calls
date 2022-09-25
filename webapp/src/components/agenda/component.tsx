/* eslint-disable max-lines */

import React, {useEffect, useState} from 'react';

import ChecklistList from 'src/components/checklist/checklist_list';
import {addAgendaItem, fetchAgendaForChannel, updateAgendaItem} from 'src/rest_client';

import {Checklist, ChecklistItem, emptyChecklist} from 'src/types/checklist';

interface Props {
    channelId: string,
}

const Agenda = ({channelId}: Props) => {
    const [checklist, setChecklist] = useState(emptyChecklist());

    useEffect(() => {
        async function getAgenda() {
            console.log(channelId, 'getting agenda');
            setChecklist(await fetchAgendaForChannel(channelId) || emptyChecklist());
        }
        getAgenda();
    }, [channelId]);

    const onUpdateChecklistItem = async (newItem: ChecklistItem, index: number) => {
        const item = await updateAgendaItem(channelId, newItem);
        if (!item) {
            console.log('<><> no checklist item returned');
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

    return (
        <ChecklistList
            checklists={[checklist]}
            onChecklistsUpdated={(...params) => console.log(params)}
            onUpdateChecklistItem={onUpdateChecklistItem}
            onAddChecklistItem={onAddChecklistItem}
        />
    );
};

export default Agenda;
