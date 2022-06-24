import {pluginId} from './manifest';
import {Checklist, ChecklistItemsFilter} from './types/checklist';

export const VOICE_CHANNEL_ENABLE = pluginId + '_voice_channel_enable';
export const VOICE_CHANNEL_DISABLE = pluginId + '_voice_channel_disable';
export const VOICE_CHANNEL_USER_CONNECTED = pluginId + '_voice_channel_user_connected';
export const VOICE_CHANNEL_USER_DISCONNECTED = pluginId + '_voice_channel_user_disconnected';
export const VOICE_CHANNEL_USER_MUTED = pluginId + '_voice_channel_user_muted';
export const VOICE_CHANNEL_USER_UNMUTED = pluginId + '_voice_channel_user_unmuted';
export const VOICE_CHANNEL_USER_VOICE_ON = pluginId + '_voice_channel_user_voice_on';
export const VOICE_CHANNEL_USER_VOICE_OFF = pluginId + '_voice_channel_user_voice_off';
export const VOICE_CHANNEL_USERS_CONNECTED = pluginId + '_voice_channel_users_connected';
export const VOICE_CHANNEL_USERS_CONNECTED_STATES = pluginId + '_voice_channel_users_connected_states';
export const VOICE_CHANNEL_PROFILES_CONNECTED = pluginId + '_voice_channel_profiles_connected';
export const VOICE_CHANNEL_PROFILE_CONNECTED = pluginId + '_voice_channel_profile_connected';
export const VOICE_CHANNEL_CALL_START = pluginId + '_voice_channel_call_start';
export const VOICE_CHANNEL_CALL_END = pluginId + '_voice_channel_call_end';
export const VOICE_CHANNEL_USER_SCREEN_ON = pluginId + '_voice_channel_screen_on';
export const VOICE_CHANNEL_USER_SCREEN_OFF = pluginId + '_voice_channel_screen_off';
export const VOICE_CHANNEL_UNINIT = pluginId + '_voice_channel_uninit';
export const VOICE_CHANNEL_USER_RAISE_HAND = pluginId + '_voice_channel_user_raise_hand';
export const VOICE_CHANNEL_USER_UNRAISE_HAND = pluginId + '_voice_channel_user_unraise_hand';
export const VOICE_CHANNEL_ROOT_POST = pluginId + '_voice_channel_root_post';

export const SHOW_EXPANDED_VIEW = pluginId + '_show_expanded_view';
export const HIDE_EXPANDED_VIEW = pluginId + '_hide_expanded_view';
export const SHOW_NEXT_STEPS_MODAL = pluginId + '_show_next_steps_modal';
export const HIDE_NEXT_STEPS_MODAL = pluginId + '_hide_next_steps_modal';
export const SHOW_SWITCH_CALL_MODAL = pluginId + '_show_switch_call_modal';
export const HIDE_SWITCH_CALL_MODAL = pluginId + '_hide_switch_call_modal';
export const SHOW_SCREEN_SOURCE_MODAL = pluginId + '_show_screen_source_modal';
export const HIDE_SCREEN_SOURCE_MODAL = pluginId + '_hide_screen_source_modal';
export const SHOW_END_CALL_MODAL = pluginId + '_show_end_call_modal';
export const HIDE_END_CALL_MODAL = pluginId + '_hide_end_call_modal';

export const RECEIVED_CALLS_CONFIG = pluginId + '_received_calls_config';

export const SET_EACH_CHECKLIST_COLLAPSED_STATE = pluginId + '_set_every_checklist_collapsed_state';
export const SET_CHECKLIST_COLLAPSED_STATE = pluginId + '_set_checklist_collapsed_state';
export const SET_ALL_CHECKLISTS_COLLAPSED_STATE = pluginId + '_set_all_checklists_collapsed_state';
export const SET_CHECKLIST_ITEMS_FILTER = pluginId + '_set_checklist_items_filter';
export const SET_CHECKLIST = pluginId + '_set_checklist';

export interface SetChecklistCollapsedState {
    type: typeof SET_CHECKLIST_COLLAPSED_STATE;
    channelId: string;
    checklistIndex: number;
    collapsed: boolean;
}

export interface SetEachChecklistCollapsedState {
    type: typeof SET_EACH_CHECKLIST_COLLAPSED_STATE;
    channelId: string;
    state: Record<number, boolean>;
}

export interface SetAllChecklistsCollapsedState {
    type: typeof SET_ALL_CHECKLISTS_COLLAPSED_STATE;
    channelId: string;
    numOfChecklists: number;
    collapsed: boolean;
}

export interface SetChecklistItemsFilter {
    type: typeof SET_CHECKLIST_ITEMS_FILTER;
    channelId: string;
    nextState: ChecklistItemsFilter;
}

export interface SetChecklist {
    type: typeof SET_CHECKLIST;
    channelId: string;
    nextState: Checklist;
}
