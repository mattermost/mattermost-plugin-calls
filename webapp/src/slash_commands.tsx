// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CommandArgs} from '@mattermost/types/integrations';
import {getChannel as getChannelAction} from 'mattermost-redux/actions/channels';
import {Client4} from 'mattermost-redux/client';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId, isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {ActionResult} from 'mattermost-redux/types/actions';
import {defineMessage} from 'react-intl';
import {
    displayGenericErrorModal,
    startCallRecording,
    stopCallRecording,
} from 'src/actions';
import {
    EndCallConfirmation,
    IDEndCallConfirmation,
} from 'src/components/call_widget/end_call_confirmation';
import {
    DisabledCallsErr,
    MAX_INLINE_LOG_POST_SIZE,
    STORAGE_CALLS_CLIENT_STATS_KEY,
} from 'src/constants';
import {modals} from 'src/webapp_globals';

import {flushLogsToAccumulated, getClientLogs, logDebug} from './log';
import {
    areGroupCallsAllowed,
    channelHasCall,
    channelIDForCurrentCall,
    hostIDForCallInChannel,
    hostIDForCurrentCall,
    isRecordingInCurrentCall,
} from './selectors';
import {Store} from './types/mattermost-webapp';
import {getCallsClient, getCallsWindow, getPersistentStorage, isDMChannel, sendDesktopEvent, shouldRenderDesktopWidget} from './utils';

type joinCallFn = (channelId: string, teamId?: string, title?: string, rootId?: string) => void;

export default async function slashCommandsHandler(store: Store, joinCall: joinCallFn, message: string, args: CommandArgs) {
    const fullCmd = message.trim();
    const fields = fullCmd.split(/\s+/);
    if (fields.length < 2) {
        return {message, args};
    }

    const rootCmd = fields[0];
    const subCmd = fields[1];

    if (rootCmd !== '/call') {
        return {message, args};
    }

    const connectedID = channelIDForCurrentCall(store.getState());

    switch (subCmd) {
    case 'join':
    case 'start': {
        let channel = getChannel(store.getState(), args.channel_id);
        if (!channel) {
            const res = await store.dispatch(getChannelAction(args.channel_id)) as ActionResult;
            channel = res.data;
        }

        if (!isDMChannel(channel) && !areGroupCallsAllowed(store.getState())) {
            store.dispatch(displayGenericErrorModal(
                defineMessage({defaultMessage: 'Unable to join call'}),
                defineMessage({defaultMessage: 'Calls are only available in DM channels.'}),
            ));
            return {};
        }

        if (subCmd === 'start') {
            if (channelHasCall(store.getState(), args.channel_id)) {
                store.dispatch(displayGenericErrorModal(
                    defineMessage({defaultMessage: 'Unable to start call'}),
                    defineMessage({defaultMessage: 'A call is already ongoing in the channel.'}),
                ));
                return {};
            }
        }
        if (!connectedID) {
            let title = '';
            if (fields.length > 2) {
                title = fields.slice(2).join(' ');
            }

            let team_id = args?.team_id;
            if (!team_id) {
                team_id = channel?.team_id;
            }

            try {
                await joinCall(args.channel_id, team_id, title, args.root_id);
                return {};
            } catch (e) {
                let msg = defineMessage({defaultMessage: 'An internal error occurred and prevented you from joining the call. Please try again.'});
                if (e === DisabledCallsErr) {
                    msg = defineMessage({defaultMessage: 'Calls are disabled in this channel.'});
                }
                store.dispatch(displayGenericErrorModal(
                    defineMessage({defaultMessage: 'Unable to start or join call'}),
                    msg,
                ));
                return {};
            }
        }

        store.dispatch(displayGenericErrorModal(
            defineMessage({defaultMessage: 'Unable to join call'}),
            defineMessage({defaultMessage: 'You\'re already connected to a call in the current channel.'}),
        ));
        return {};
    }
    case 'leave':
        if (connectedID && args.channel_id === connectedID) {
            const win = getCallsWindow();
            const callsClient = getCallsClient();
            if (callsClient) {
                callsClient.disconnect();
                return {};
            } else if (win.desktopAPI?.leaveCall) {
                logDebug('desktopAPI.leaveCall');
                win.desktopAPI.leaveCall();
                return {};
            } else if (shouldRenderDesktopWidget()) {
                // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
                sendDesktopEvent('calls-leave-call', {callID: args.channel_id});
                return {};
            }
        }
        store.dispatch(displayGenericErrorModal(
            defineMessage({defaultMessage: 'Unable to leave the call'}),
            defineMessage({defaultMessage: 'You\'re not connected to a call in the current channel.'}),
        ));
        return {};
    case 'end':
        if (!channelHasCall(store.getState(), args.channel_id)) {
            store.dispatch(displayGenericErrorModal(
                defineMessage({defaultMessage: 'Unable to end the call'}),
                defineMessage({defaultMessage: 'There\'s no ongoing call in the channel.'}),
            ));
            return {};
        }

        if (!isCurrentUserSystemAdmin(store.getState()) &&
                    getCurrentUserId(store.getState()) !== hostIDForCallInChannel(store.getState(), args.channel_id)) {
            store.dispatch(displayGenericErrorModal(
                defineMessage({defaultMessage: 'Unable to end the call'}),
                defineMessage({defaultMessage: 'You don\'t have permission to end the call. Please ask the call owner to end call.'}),
            ));
            return {};
        }

        store.dispatch(modals?.openModal({
            modalId: IDEndCallConfirmation,
            dialogType: EndCallConfirmation,
            dialogProps: {
                channelID: args.channel_id,
            },
        }));

        return {};
    case 'link':
        break;
    case 'stats': {
        if (window.callsClient) {
            try {
                const stats = await window.callsClient.getStats();
                return {message: `/call stats ${btoa(JSON.stringify(stats))}`, args};
            } catch (err) {
                return {error: {message: err}};
            }
        }
        const data = getPersistentStorage().getItem(STORAGE_CALLS_CLIENT_STATS_KEY) || '{}';
        return {message: `/call stats ${btoa(data)}`, args};
    }
    case 'logs': {
        // Flush current session first
        flushLogsToAccumulated();

        // Get all accumulated logs
        const allLogs = getClientLogs();

        if (!allLogs || allLogs.trim().length === 0) {
            return {error: {message: 'No call logs available'}};
        }

        // Choose: inline post or file upload
        if (allLogs.length < MAX_INLINE_LOG_POST_SIZE) {
            // Small enough - post inline (existing behavior)
            return {message: `/call logs ${btoa(allLogs)}`, args};
        }

        // Too large - upload as file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `call_logs_${timestamp}.txt`;
        const sizeKB = (allLogs.length / 1024).toFixed(1);

        const blob = new Blob([allLogs], {type: 'text/plain'});
        const file = new File([blob], filename, {type: 'text/plain'});

        const formData = new FormData();
        formData.append('files', file);
        formData.append('channel_id', args.channel_id);

        try {
            const fileUploadResp = await Client4.uploadFile(formData);
            const fileId = fileUploadResp.file_infos[0].id;

            await Client4.createPost({
                channel_id: args.channel_id,
                message: `📋 Call logs (${sizeKB} KB)`,
                file_ids: [fileId],
            } as any);

            return {};
        } catch (err) {
            return {error: {message: `Failed to upload logs: ${(err as Error).message}`}};
        }
    }
    case 'recording': {
        if (fields.length < 3 || (fields[2] !== 'start' && fields[2] !== 'stop')) {
            break;
        }

        const startErrorTitle = defineMessage({defaultMessage: 'Unable to start recording'});
        const stopErrorTitle = defineMessage({defaultMessage: 'Unable to stop recording'});

        if (args.channel_id !== connectedID) {
            store.dispatch(displayGenericErrorModal(
                fields[2] === 'start' ? startErrorTitle : stopErrorTitle,
                defineMessage({defaultMessage: 'You\'re not connected to a call in the current channel.'}),
            ));
            return {};
        }

        const state = store.getState();
        const isHost = hostIDForCurrentCall(state) === getCurrentUserId(state);

        if (fields[2] === 'start') {
            if (!isHost) {
                store.dispatch(displayGenericErrorModal(
                    startErrorTitle,
                    defineMessage({defaultMessage: 'You don\'t have permission to start a recording. Please ask the call host to start a recording.'}),
                ));
                return {};
            }

            if (isRecordingInCurrentCall(state)) {
                store.dispatch(displayGenericErrorModal(
                    startErrorTitle,
                    defineMessage({defaultMessage: 'A recording is already in progress.'}),
                ));
                return {};
            }

            await store.dispatch(startCallRecording(connectedID));
        }

        if (fields[2] === 'stop') {
            if (!isHost) {
                store.dispatch(displayGenericErrorModal(
                    stopErrorTitle,
                    defineMessage({defaultMessage: 'You don\'t have permission to stop the recording. Please ask the call host to stop the recording.'}),
                ));
                return {};
            }

            if (!isRecordingInCurrentCall(state)) {
                store.dispatch(displayGenericErrorModal(
                    stopErrorTitle,
                    defineMessage({defaultMessage: 'No recording is in progress.'}),
                ));
                return {};
            }

            await stopCallRecording(connectedID);
        }
        break;
    }
    }

    return {message, args};
}
