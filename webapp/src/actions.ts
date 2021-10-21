import {Dispatch} from 'redux';
import {GenericAction} from 'mattermost-redux/types/actions';

import {
    SHOW_EXPANDED_VIEW,
    HIDE_EXPANDED_VIEW,
} from './action_types';

export const showExpandedView = () => (dispatch: Dispatch<GenericAction>) => {
    dispatch({
        type: SHOW_EXPANDED_VIEW,
    });
};

export const hideExpandedView = () => (dispatch: Dispatch<GenericAction>) => {
    dispatch({
        type: HIDE_EXPANDED_VIEW,
    });
};
