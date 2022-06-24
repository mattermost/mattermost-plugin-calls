import {bindActionCreators, Dispatch} from 'redux';
import {connect} from 'react-redux';
import {GlobalState} from '@mattermost/types/store';

import {getAgendaForChannel, updateAgendaItemForChannel} from 'src/actions';
import {checklistForChannel} from 'src/selectors';

import Agenda from './component';

interface OwnProps {
    channelId: string,
}

const mapStateToProps = (state: GlobalState, ownProps: OwnProps) => {
    return {
        checklist: checklistForChannel(state, ownProps.channelId),
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    getAgendaForChannel,
    updateAgendaItemForChannel,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(Agenda);

