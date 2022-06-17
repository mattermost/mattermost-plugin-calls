import React, {CSSProperties} from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';

import {Channel} from '@mattermost/types/channels';
import {UserProfile} from '@mattermost/types/users';

import {changeOpacity} from 'mattermost-redux/utils/theme_utils';

import {isDMChannel, isGMChannel, getUserDisplayName} from '../../utils';

import CompassIcon from '../../components/icons/compassIcon';

import './component.scss';

interface Props {
    theme: any,
    currentChannel: Channel,
    connectedChannel: Channel,
    currentDMUser: UserProfile | undefined,
    connectedDMUser: UserProfile | undefined,
    show: boolean,
    hideNextStepsModal: () => void,
}

export default class NextStepsModal extends React.PureComponent<Props> {
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
            borderRadius: '8px',
            border: `1px solid ${changeOpacity(this.props.theme.centerChannelColor, 0.16)}`,
            boxShadow: `0px 20px 32px ${changeOpacity(this.props.theme.centerChannelColor, 0.12)}`,
            width: '512px',
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

    private joinCall = () => {
        this.props.hideNextStepsModal();
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

        let message1;
        if (isDMChannel(this.props.connectedChannel)) {
            message1 = (<React.Fragment>
                {'You\'re already in a call with '}
                <span style={{fontWeight: 600}}>{getUserDisplayName(this.props.connectedDMUser)}</span>
            </React.Fragment>);
        } else if (isGMChannel(this.props.connectedChannel)) {
            message1 = (<React.Fragment>
                {'You\'re already in a call with '}
                <span style={{fontWeight: 600}}>{this.props.connectedChannel.display_name}</span>
            </React.Fragment>);
        } else {
            message1 = (<React.Fragment>
                {'You\'re already in a call in '}
                <span style={{fontWeight: 600}}>{this.props.connectedChannel.display_name}</span>
            </React.Fragment>);
        }

        let message2;
        if (isDMChannel(this.props.currentChannel)) {
            message2 = (<React.Fragment>
                {'. Do you want to leave and join a call with '}
                <span style={{fontWeight: 600}}>{getUserDisplayName(this.props.currentDMUser)}</span>
                {'?'}
            </React.Fragment>);
        } else if (isGMChannel(this.props.currentChannel)) {
            message2 = (<React.Fragment>
                {'. Do you want to leave and join a call with '}
                <span style={{fontWeight: 600}}>{this.props.currentChannel.display_name}</span>
                {'?'}
            </React.Fragment>);
        } else {
            message2 = (<React.Fragment>
                {'. Do you want to leave and join a call in '}
                <span style={{fontWeight: 600}}>{this.props.currentChannel.display_name}</span>
                {'?'}
            </React.Fragment>);
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
                        onClick={this.props.hideNextStepsModal}
                    >
                        <CompassIcon icon='close'/>
                    </button>
                    <div style={this.style.header as CSSProperties}>
                        <span style={this.style.title}>
                            {'You\'re already in a call'}
                        </span>
                    </div>
                    <div style={this.style.body as CSSProperties}>
                        { message1 }
                        { message2 }
                    </div>
                    <div style={this.style.footer}>
                        <button
                            className='style--none switch-call-modal-cancel'
                            onClick={this.props.hideNextStepsModal}
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
