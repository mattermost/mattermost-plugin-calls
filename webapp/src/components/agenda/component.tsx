/* eslint-disable max-lines */

import React from 'react';

import ChecklistList from 'src/components/checklist/checklist_list';

import {Checklist, ChecklistItemState} from 'src/types/checklist';

interface Props {
    channelId: string,
    checklist: Checklist,
    getAgendaForChannel: (channelId: string) => void,
}

export default class ExpandedView extends React.PureComponent<Props> {
    public componentDidMount() {
        const {channelId, getAgendaForChannel} = this.props;
        getAgendaForChannel(channelId);
    }

    render() {
        const {checklist} = this.props;
        return (
            <ChecklistList
                checklists={[checklist]}
                onChecklistsUpdated={() => console.log('checklists updated')}
                onChecklistItemStateChanged={(id: string, state: ChecklistItemState) => console.log(`checklist item state change: ${id} ${state}`)}
            />
        );
    }
}
