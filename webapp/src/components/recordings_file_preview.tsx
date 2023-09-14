import {FileInfo} from '@mattermost/types/files';
import {Post} from '@mattermost/types/posts';
import {GlobalState} from '@mattermost/types/store';
import {Client4} from 'mattermost-redux/client';
import {getPost} from 'mattermost-redux/selectors/entities/posts';
import React from 'react';
import {useSelector} from 'react-redux';
import styled from 'styled-components';

type Props = {
    fileInfo: FileInfo;
    post: Post;
}

const RecordingsFilePreview = ({fileInfo, post}: Props) => {
    const callThread = useSelector((state: GlobalState) => getPost(state, post.root_id));

    const transcriptionsID = callThread?.props?.transcription_files?.[0];

    // TODO: add support for multiple recordings/transcriptions per call
    // thread.

    return (
        <Video
            width='640'
            height='480'
            controls={true}
        >
            <source
                src={Client4.getFileUrl(fileInfo.id, Date.now())}
                type={fileInfo.mime_type}
            />
            { transcriptionsID &&
            <track
                label='Transcription'
                kind='subtitles'
                srcLang='en'
                src={Client4.getFileUrl(transcriptionsID, Date.now())}
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
