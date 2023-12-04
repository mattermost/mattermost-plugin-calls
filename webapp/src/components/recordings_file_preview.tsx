import {FileInfo} from '@mattermost/types/files';
import {Post} from '@mattermost/types/posts';
import {Client4} from 'mattermost-redux/client';
import React, {useMemo} from 'react';
import styled from 'styled-components';

type Props = {
    fileInfo: FileInfo;
    post: Post;
}

const RecordingsFilePreview = ({fileInfo, post}: Props) => {
    const now = useMemo(() => Date.now(), [post.props.captions_file_id]);

    return (
        <Video
            data-testid='calls-recording-player'
            width='640'
            height='480'
            controls={true}
        >
            <source
                src={Client4.getFileUrl(fileInfo.id, now)}
                type={fileInfo.mime_type}
            />
            { post.props.captions_file_id &&
            <track
                data-testid='calls-recording-transcription'
                label='Transcription'
                kind='subtitles'
                srcLang='en'
                src={Client4.getFileUrl(post.props.captions_file_id, now)}
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
