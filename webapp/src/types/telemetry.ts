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
}

export enum Source {
    Widget = 'widget',
    ExpandedView = 'expanded_view',
}

