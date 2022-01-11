import React, {CSSProperties} from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';

import {Channel} from 'mattermost-redux/types/channels';

import {changeOpacity} from 'mattermost-redux/utils/theme_utils';

import CompassIcon from '../../components/icons/compassIcon';

import './component.scss';

interface Props {
    theme: any,
    currentChannel: Channel,
    connectedChannel: Channel,
    show: boolean,
    hideSwitchCallModal: () => void,
}

export default class SwitchCallModal extends React.PureComponent<Props> {
    private node: React.RefObject<HTMLDivElement>;
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
            borderRadius: '12px',
            border: `1px solid ${changeOpacity(this.props.theme.centerChannelColor, 0.16)}`,
            boxShadow: `0px 20px 32px ${changeOpacity(this.props.theme.centerChannelColor, 0.12)}`,
            padding: '40px',
        },
        header: {
            fontWeight: 600,
            fontSize: '18px',
            marginBottom: '8px',
        },
        body: {
            whiteSpace: 'pre',
        },
        footer: {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginTop: '32px',
        },
    };

    constructor(props: Props) {
        super(props);
        this.node = React.createRef();
    }

    private keyboardClose = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            this.props.hideSwitchCallModal();
        }
    }

    private closeOnBlur = (e: Event) => {
        if (this.node?.current && e.target && this.node.current.contains(e.target as Node)) {
            return;
        }
        this.props.hideSwitchCallModal();
    }

    private joinCall = () => {
        this.props.hideSwitchCallModal();
        window.callsClient?.disconnect();
        window.postMessage({type: 'connectCall', channelID: this.props.currentChannel.id}, window.origin);
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
                    id='calls-switch-call-modal'
                    style={this.style.modal as CSSProperties}
                    ref={this.node}
                >
                    <button
                        className='style--none switch-call-modal-close'
                        onClick={this.props.hideSwitchCallModal}
                    >
                        <CompassIcon icon='close'/>
                    </button>
                    <div style={this.style.header}>
                        {'You\'re already in a call'}
                    </div>
                    <div style={this.style.body as CSSProperties}>
                        {'You\'re already in a call in '}
                        <span style={{fontWeight: 600}}>{this.props.connectedChannel.display_name}</span>
                        {'. Do you want to leave and join a call in '}
                        <span style={{fontWeight: 600}}>{this.props.currentChannel.display_name}</span>
                        {'?'}
                    </div>
                    <div style={this.style.footer}>
                        <button
                            className='style--none switch-call-modal-cancel'
                            onClick={this.props.hideSwitchCallModal}
                        >{'Cancel'}</button>
                        <button
                            className='style--none switch-call-modal-join'
                            onClick={this.joinCall}
                        >{'Leave & join new call'}</button>
                    </div>
                </div>
            </div>
        );
    }
}
