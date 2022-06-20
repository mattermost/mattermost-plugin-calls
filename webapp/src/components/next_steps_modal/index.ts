import {bindActionCreators, Dispatch} from 'redux';
import {connect} from 'react-redux';
import {GlobalState} from '@mattermost/types/store';

import {getPost} from 'mattermost-redux/selectors/entities/posts';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/common';
import {createPost} from 'mattermost-redux/actions/posts';

import {hideNextStepsModal} from '../../actions';
import {nextStepsModal} from '../../selectors';

import NextStepsModal from './component';

const mapStateToProps = (state: GlobalState) => {
    const nextStepsState = nextStepsModal(state);
    const post = getPost(state, nextStepsState.targetID);
    const currentUserId = getCurrentUserId(state);

    return {
        show: nextStepsModal(state).show,
        rootPostId: post?.id || '',
        channelId: post?.channel_id || '',
        currentUserId,
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    hideNextStepsModal,
    createPost,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(NextStepsModal);
