import React from 'react';
import {useSelector} from 'react-redux';
import styled from 'styled-components';

import {FileInfo} from '@mattermost/types/files';
import {Post} from '@mattermost/types/posts';
import {GlobalState} from '@mattermost/types/store';
import {Client4} from 'mattermost-redux/client';
import {getPost} from 'mattermost-redux/selectors/entities/posts';

type Props = {
    fileInfo: FileInfo;
    post: Post;
}

const RecordingsFilePreview = ({fileInfo, post}: Props) => {
    const callPost = useSelector((state: GlobalState) => getPost(state, post.props?.call_post_id));

    const recording = callPost?.props?.recordings?.[post.props?.recording_id];
    const transcription = callPost?.props?.transcriptions?.[recording?.tr_id];

    return (
        <Video
            data-testid='calls-recording-player'
            width='640'
            height='480'
            controls={true}
        >
            <source
                src={Client4.getFileUrl(fileInfo.id, Date.now())}
                type={fileInfo.mime_type}
            />
            { transcription?.file_id &&
            <track
                data-testid='calls-recording-transcription'
                label='Transcription'
                kind='subtitles'
                srcLang='en'
                src={Client4.getFileUrl(transcription.file_id, Date.now())}
                default={true}
            />
            }
        </Video>
    );
};

const Video = styled.video`
::cue {
  font-size: 20px;
}
`;

export default RecordingsFilePreview;
