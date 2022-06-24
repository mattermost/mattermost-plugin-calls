/* eslint-disable max-lines */

import React from 'react';

import ChecklistList from 'src/components/checklist/checklist_list';

import {Checklist, ChecklistItem} from 'src/types/checklist';

interface Props {
    channelId: string,
    checklist: Checklist,
    getAgendaForChannel: (channelId: string) => void,
    updateAgendaItemForChannel: (channelId: string, item: ChecklistItem) => void,
}

export default class ExpandedView extends React.PureComponent<Props> {
    public componentDidMount() {
        const {channelId, getAgendaForChannel} = this.props;
        getAgendaForChannel(channelId);
    }

    render() {
        const {channelId, checklist, updateAgendaItemForChannel} = this.props;
        return (
            <ChecklistList
                checklists={[checklist]}
                onChecklistsUpdated={() => console.log('checklists updated')}
                onUpdateChecklistItem={(item: ChecklistItem) => updateAgendaItemForChannel(channelId, item)}
            />
        );
    }
}
