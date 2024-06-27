import {pluginId} from './manifest';

export const USER_JOINED = pluginId + '_user_joined';
export const USER_LEFT = pluginId + '_user_left';
export const USER_MUTED = pluginId + '_user_muted';
export const USER_UNMUTED = pluginId + '_user_unmuted';
export const USER_VOICE_ON = pluginId + '_user_voice_on';
export const USER_VOICE_OFF = pluginId + '_user_voice_off';
export const USERS_STATES = pluginId + '_users_states';
export const CALL_STATE = pluginId + '_call_state';
export const USER_SCREEN_ON = pluginId + '_screen_on';
export const USER_SCREEN_OFF = pluginId + '_screen_off';
export const UNINIT = pluginId + '_uninit';
export const USER_RAISE_HAND = pluginId + '_user_raise_hand';
export const USER_LOWER_HAND = pluginId + '_user_unraise_hand';
export const USER_REACTED = pluginId + '_user_reacted';
export const USER_REACTED_TIMEOUT = pluginId + '_user_reacted_timeout';
export const CALL_HOST = pluginId + '_call_host';
export const CALL_RECORDING_STATE = pluginId + '_call_recording_state';
export const CALL_LIVE_CAPTIONS_STATE = pluginId + '_call_live_captions_state';
export const CALL_REC_PROMPT_DISMISSED = pluginId + '_call_rec_prompt_dismissed';
export const USER_JOINED_TIMEOUT = pluginId + '_user_joined_timeout';
export const LIVE_CAPTION = pluginId + '_live_caption';
export const LIVE_CAPTION_TIMEOUT_EVENT = pluginId + '_live_caption_timeout_event';
export const HOST_CONTROL_NOTICE = pluginId + '_host_control_notice';
export const HOST_CONTROL_NOTICE_TIMEOUT_EVENT = pluginId + '_host_control_notice_timeout_event';

export const SHOW_EXPANDED_VIEW = pluginId + '_show_expanded_view';
export const HIDE_EXPANDED_VIEW = pluginId + '_hide_expanded_view';
export const SHOW_SWITCH_CALL_MODAL = pluginId + '_show_switch_call_modal';
export const HIDE_SWITCH_CALL_MODAL = pluginId + '_hide_switch_call_modal';
export const SHOW_SCREEN_SOURCE_MODAL = pluginId + '_show_screen_source_modal';
export const HIDE_SCREEN_SOURCE_MODAL = pluginId + '_hide_screen_source_modal';
export const SHOW_END_CALL_MODAL = pluginId + '_show_end_call_modal';
export const HIDE_END_CALL_MODAL = pluginId + '_hide_end_call_modal';
export const ADD_INCOMING_CALL = pluginId + '_add_incoming_call';
export const REMOVE_INCOMING_CALL = pluginId + '_remove_incoming_call';
export const DISMISS_CALL = pluginId + '_dismiss_call';
export const RINGING_FOR_CALL = pluginId + '_ringing_for_call';
export const DID_RING_FOR_CALL = pluginId + '_did_ring_for_call';
export const DID_NOTIFY_FOR_CALL = pluginId + '_did_notify_for_call';

// CALL_END is sent when the `/call end` command is used,
//  and when the last session in the call leaves the call
export const CALL_END = pluginId + '_call_end';

export const RECEIVED_CALLS_CONFIG = pluginId + '_received_calls_config';
export const RECORDINGS_ENABLED = pluginId + '_recordings_enabled';
export const TRANSCRIPTIONS_ENABLED = pluginId + '_transcriptions_enabled';
export const LIVE_CAPTIONS_ENABLED = pluginId + '_live_captions_enabled';
export const RTCD_ENABLED = pluginId + '_rtcd_enabled';
export const TRANSCRIBE_API = pluginId + '_transcribe_api';
export const RECEIVED_CHANNEL_STATE = pluginId + 'received_channel_state';
export const RECEIVED_CALLS_USER_PREFERENCES = pluginId + '_received_calls_user_preferences';

export const DESKTOP_WIDGET_CONNECTED = pluginId + '_desktop_widget_connected';

export const CLIENT_CONNECTING = pluginId + '_client_connecting';

