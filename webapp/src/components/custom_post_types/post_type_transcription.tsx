import {GlobalState} from '@mattermost/types/store';
import React from 'react';
import {FormattedMessage} from 'react-intl';
import {useSelector} from 'react-redux';
import IconAI from 'src/components/icons/ai';
import styled from 'styled-components';

const useAIAvailable = () => {
    //@ts-ignore plugins state is a thing
    return useSelector<GlobalState, boolean>((state) => Boolean(state.plugins?.plugins?.[aiPluginID]));
};

const aiPluginID = 'mattermost-ai';

type CallsPostButtonClickedFunc = ((post: any) => void) | undefined;

const useCallsPostButtonClicked = () => {
    return useSelector<GlobalState, CallsPostButtonClickedFunc>((state) => {
        //@ts-ignore plugins state is a thing
        return state['plugins-' + aiPluginID]?.callsPostButtonClickedTranscription;
    });
};

const CreateMeetingSummaryButton = styled.button`
	display: flex;
	border: none;
	height: 24px;
	padding: 4px 10px;
	margin-top: 8px;
	margin-bottom: 8px;
	align-items: center;
	justify-content: center;
	gap: 6px;
	border-radius: 4px;
	background: rgba(var(--center-channel-color-rgb), 0.08);
    color: rgba(var(--center-channel-color-rgb), 0.64);
	font-size: 12px;
	font-weight: 600;
	line-height: 16px;

	&:hover {
		background: rgba(var(--center-channel-color-rgb), 0.12);
        color: rgba(var(--center-channel-color-rgb), 0.72);
	}

	&:active {
		background: rgba(var(--button-bg-rgb), 0.08);
		color: var(--button-bg);
	}
`;

interface Props {
    post: {id: string, message: string};
}

export const PostTypeTranscription = (props: Props) => {
    const aiAvailable = useAIAvailable();
    const callsPostButtonClicked = useCallsPostButtonClicked();

    const createMeetingSummary = () => {
        callsPostButtonClicked?.(props.post);
    };

    const msg = props.post.message;

    return (
        <div data-testid={'calls-post-transcription-body'}>
            {msg}
            {aiAvailable && callsPostButtonClicked &&
            <CreateMeetingSummaryButton
                onClick={createMeetingSummary}
            >
                <IconAI/>
                <FormattedMessage defaultMessage={'Create meeting summary'}/>
            </CreateMeetingSummaryButton>
            }
        </div>
    );
};
