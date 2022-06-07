import React, {CSSProperties} from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';

import {Channel} from 'mattermost-redux/types/channels';
import {UserProfile} from 'mattermost-redux/types/users';

import {changeOpacity} from 'mattermost-redux/utils/theme_utils';

import {isDMChannel, isGMChannel, getUserDisplayName} from '../../utils';

import {endCall} from '../../actions';

import CompassIcon from '../../components/icons/compassIcon';

import './component.scss';

interface Props {
    theme: any,
    show: boolean,
    channel: Channel,
    connectedDMUser: UserProfile | undefined,
    connectedUsers: string[],
    hideEndCallModal: () => void,
}

interface State {
    errorMsg: string,
}

export default class EndCallModal extends React.PureComponent<Props, State> {
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
        error: {
            marginTop: '8px',
            color: this.props.theme.errorTextColor,
        },
    };

    constructor(props: Props) {
        super(props);
        this.node = React.createRef();
        this.state = {
            errorMsg: '',
        };
    }

    private keyboardClose = (e: KeyboardEvent) => {
        if (this.props.show && e.key === 'Escape') {
            this.hideModal();
        }
    }

    private closeOnBlur = (e: Event) => {
        if (!this.props.show) {
            return;
        }
        if (this.node?.current && e.target && this.node.current.contains(e.target as Node)) {
            return;
        }
        this.hideModal();
    }

    private endCall = () => {
        endCall(this.props.channel.id).then(() => {
            this.hideModal();
        }).catch((err) => {
            this.setState({
                errorMsg: err.response && err.response.data ? err.response.data.err : err.toString(),
            });
        });
    }

    private hideModal = () => {
        this.setState({errorMsg: ''});
        this.props.hideEndCallModal();
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

        let msg;
        if (isDMChannel(this.props.channel)) {
            msg = (<React.Fragment>
                {'Are you sure you want to end a call with '}
                <span style={{fontWeight: 600}}>{getUserDisplayName(this.props.connectedDMUser)}</span>
                {'?'}
            </React.Fragment>);
        } else if (isGMChannel(this.props.channel)) {
            msg = (<React.Fragment>
                {'Are you sure you want to end a call with '}
                <span style={{fontWeight: 600}}>{this.props.channel.display_name}</span>
                {'?'}
            </React.Fragment>);
        } else {
            msg = (<React.Fragment>
                {`Are you sure you want to end a call with ${this.props.connectedUsers.length} participants in `}
                <span style={{fontWeight: 600}}>{this.props.channel.display_name}</span>
                {'?'}
            </React.Fragment>);
        }

        return (
            <div style={this.style.main as CSSProperties}>
                <div
                    id='calls-end-call-modal'
                    style={this.style.modal as CSSProperties}
                    ref={this.node}
                >
                    <button
                        className='style--none end-call-modal-close'
                        onClick={this.hideModal}
                    >
                        <CompassIcon icon='close'/>
                    </button>
                    <div style={this.style.header as CSSProperties}>
                        <span style={this.style.title}>
                            {'End call'}
                        </span>
                    </div>
                    <div style={this.style.body as CSSProperties}>
                        { msg }
                    </div>

                    { this.state.errorMsg &&
                    <div style={this.style.error as CSSProperties}>
                        { `An error has occurred: ${this.state.errorMsg}` }
                    </div>
                    }

                    <div style={this.style.footer}>
                        <button
                            className='style--none end-call-modal-cancel'
                            onClick={this.hideModal}
                        >{'Cancel'}</button>
                        <button
                            className='style--none end-call-modal-confirm'
                            onClick={this.endCall}
                        >{'End call'}</button>
                    </div>
                </div>
            </div>
        );
    }
}
