/* eslint-disable max-lines */

import React, {useEffect, useState} from 'react';

import ChecklistList from 'src/components/checklist/checklist_list';
import {fetchAgendaForChannel} from 'src/rest_client';

import {Checklist, ChecklistItem, emptyChecklist} from 'src/types/checklist';

interface Props {
    channelId: string,
}

const Agenda = (props: Props) => {
    const [checklist, updateChecklist] = useState(emptyChecklist());

    useEffect(() => {
        async function getAgenda() {
            console.log(props.channelId);
            updateChecklist(await fetchAgendaForChannel(props.channelId) || emptyChecklist());
        }
        getAgenda();
    }, [props.channelId]);

    const onUpdateChecklistItem = (newItem: ChecklistItem, index: number) => {
        const newChecklistItems = [...checklist.items];
        newChecklistItems[index] = newItem;
        const newChecklist = {...checklist};
        newChecklist.items = newChecklistItems;
        updateChecklist(newChecklist);

        //props.onUpdateChecklist(newChecklist);
    };

    const onAddChecklistItem = (newItem: ChecklistItem) => {
        const newChecklistItems = [...checklist.items];
        newChecklistItems.push(newItem);
        const newChecklist = {...checklist};
        newChecklist.items = newChecklistItems;
        updateChecklist(newChecklist);

        //props.onUpdateChecklist(newChecklist);
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
