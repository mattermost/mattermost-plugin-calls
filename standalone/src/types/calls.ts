type UserState = {
    unmuted: boolean,
    raised_hand: number,
}

type CallState = {
    id: string,
    start_at: number,
    users: string[],
    states: UserState[],
    thread_id: string,
    screen_sharing_id: string,
    owner_id: string,
}

export type ChannelState = {
    channel_id: string,
    enabled: boolean,
    call?: CallState,
}
