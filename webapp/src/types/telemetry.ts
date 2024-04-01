export enum Event {
    OpenExpandedView = 'user_open_expanded_view',
    CloseExpandedView = 'user_close_expanded_view',
    OpenParticipantsList = 'user_open_participants_list',
    CloseParticipantsList = 'user_close_participants_list',
    ShareScreen = 'user_share_screen',
    UnshareScreen = 'user_unshare_screen',
    RaiseHand = 'user_raise_hand',
    LowerHand = 'user_lower_hand',
    OpenChannelLink = 'user_open_channel_link',
    StartRecording = 'user_start_recording',
    StopRecording = 'user_stop_recording',
    NotificationJoin = 'notification_join',
    NotificationDismiss = 'notification_dismiss',
    NotificationClickGotoChannel = 'notification_click_goto_channel',
    LiveCaptionsOn = 'live_captions_on',
    LiveCaptionsOff = 'live_captions_off',
}

export enum Source {
    Widget = 'widget',
    ExpandedView = 'expanded_view',
    SlashCommand = 'slash_command',
    Channels = 'channels',
}
