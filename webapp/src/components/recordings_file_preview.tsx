import {Caption} from '@mattermost/calls-common/lib/types';
import {FileInfo} from '@mattermost/types/files';
import {Post} from '@mattermost/types/posts';
import {Client4} from 'mattermost-redux/client';
import React, {useMemo} from 'react';
import {
    getCallRecordingPropsFromPost,
} from 'src/utils';
import styled from 'styled-components';

type Props = {
    fileInfo: FileInfo;
    post: Post;
}

const RecordingsFilePreview = ({fileInfo, post}: Props) => {
    const recordingPostProps = getCallRecordingPropsFromPost(post);
    const now = useMemo(() => Date.now(), [recordingPostProps.captions]);

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
            { recordingPostProps.captions?.map((caption: Caption, idx: number) => (
                <track
                    key={idx}
                    data-testid='calls-recording-transcription'
                    label={caption.title}
                    kind='subtitles'
                    srcLang={caption.language}
                    src={Client4.getFileUrl(caption.file_id, now)}
                    default={idx === 0}
                />
            ))
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
