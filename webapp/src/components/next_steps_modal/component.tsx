import React, {CSSProperties} from 'react';
import {Post} from '@mattermost/types/posts';

import {changeOpacity} from 'mattermost-redux/utils/theme_utils';

import CompassIcon from '../../components/icons/compassIcon';

import './component.scss';
interface Props {
    theme: any,
    rootPostId: string,
    channelId: string,
    currentUserId: string,
    show: boolean,
    hideNextStepsModal: () => void,
    createPost: (post: Post, files: any[]) => void,
}

export default class NextStepsModal extends React.PureComponent<Props> {
    private node: React.RefObject<HTMLDivElement>;
    private textarea: React.RefObject<HTMLTextAreaElement>;
    private style = {
        main: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10000,
            background: changeOpacity(this.props.theme.centerChannelColor, 0.64),
        },
        modal: {
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'column',
            background: this.props.theme.centerChannelBg,
            color: this.props.theme.centerChannelColor,
            borderRadius: '8px',
            border: `1px solid ${changeOpacity(this.props.theme.centerChannelColor, 0.16)}`,
            boxShadow: `0px 20px 32px ${changeOpacity(this.props.theme.centerChannelColor, 0.12)}`,
            width: '768px',
            padding: '48px 32px',
        },
        header: {
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            paddingBottom: '8px',
        },
        title: {
            fontWeight: 600,
            fontFamily: 'Metropolis',
            fontSize: '22px',
            lineHeight: '28px',
        },
        body: {
            textAlign: 'center',
        },
        footer: {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            paddingTop: '32px',
        },
    };

    constructor(props: Props) {
        super(props);
        this.node = React.createRef();
        this.textarea = React.createRef();
    }

    private keyboardClose = (e: KeyboardEvent) => {
        if (this.props.show && e.key === 'Escape') {
            this.props.hideNextStepsModal();
        }
    }

    private closeOnBlur = (e: Event) => {
        if (!this.props.show) {
            return;
        }
        if (this.node?.current && e.target && this.node.current.contains(e.target as Node)) {
            return;
        }
        this.props.hideNextStepsModal();
    }

    private postNextSteps = () => {
        const {createPost, hideNextStepsModal, rootPostId, channelId, currentUserId} = this.props;
        const message = `#### Next Steps from Call\n\n${this.textarea.current?.value || ''}`;
        createPost({
            user_id: currentUserId,
            root_id: rootPostId,
            channel_id: channelId,
            message,
        } as Post, []);
        hideNextStepsModal();
    }

    componentDidMount() {
        document.addEventListener('keyup', this.keyboardClose, true);
        document.addEventListener('click', this.closeOnBlur, true);
    }

    componentWillUnmount() {
        document.removeEventListener('keyup', this.keyboardClose, true);
        document.removeEventListener('click', this.closeOnBlur, true);
    }

    render() {
        if (!this.props.show) {
            return null;
        }

        return (
            <div style={this.style.main as CSSProperties}>
                <div
                    id='calls-next-steps-modal'
                    style={this.style.modal as CSSProperties}
                    ref={this.node}
                >
                    <button
                        className='style--none next-steps-modal-close'
                        onClick={this.props.hideNextStepsModal}
                    >
                        <CompassIcon icon='close'/>
                    </button>
                    <div style={this.style.header as CSSProperties}>
                        <span style={this.style.title}>
                            {'Write next steps for the call:'}
                        </span>
                    </div>
                    <textarea
                        ref={this.textarea}
                        className='next-steps-input'
                    />
                    <div style={this.style.footer}>
                        <button
                            className='style--none next-steps-modal-cancel'
                            onClick={this.props.hideNextStepsModal}
                        >{'Cancel'}</button>
                        <button
                            className='style--none next-steps-modal-join'
                            onClick={this.postNextSteps}
                        >{'Post'}</button>
                    </div>
                </div>
            </div>
        );
    }
}
