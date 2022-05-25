import {Channel} from 'mattermost-redux/types/channels';

export type ChannelNamesMap = {
    [name: string]: {
        display_name: string;
        team_name?: string;
    } | Channel;
};
