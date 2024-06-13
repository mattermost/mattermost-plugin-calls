import './component.scss';

import {Channel} from '@mattermost/types/channels';
import {UserProfile} from '@mattermost/types/users';
import React, {CSSProperties} from 'react';
import {IntlShape} from 'react-intl';
import CompassIcon from 'src/components/icons/compassIcon';
import {getUserDisplayName, isDMChannel, isGMChannel, untranslatable} from 'src/utils';

interface Props {
    intl: IntlShape,
    currentChannel?: Channel,
    connectedChannel?: Channel,
    currentDMUser: UserProfile | undefined,
    connectedDMUser: UserProfile | undefined,
    show: boolean,
    targetChannelID: string,
    targetCallID: string,
    hideSwitchCallModal: () => void,
    dismissIncomingCallNotification: (channelID: string, callID: string) => void,
}

export default class SwitchCallModal extends React.PureComponent<Props> {
    private readonly node: React.RefObject<HTMLDivElement>;
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
            background: 'rgba(0, 0, 0, 0.64)',
        },
        modal: {
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'column',
            background: 'var(--center-channel-bg)',
            color: 'var(--center-channel-color)',
            borderRadius: '8px',
            border: '1px solid rgba(var(--center-channel-color-rgb), 0.16)',
            boxShadow: '0px 20px 32px rgba(var(--center-channel-color-rgb), 0.12)',
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
            this.props.hideSwitchCallModal();
        }
    };

    private closeOnBlur = (e: Event) => {
        if (!this.props.show) {
            return;
        }
        if (this.node?.current && e.target && this.node.current.contains(e.target as Node)) {
            return;
        }
        this.props.hideSwitchCallModal();
    };

    private joinCall = async () => {
        // If there is an incoming call notification, dismiss that (and for any other clients).
        this.props.dismissIncomingCallNotification(this.props.targetChannelID, this.props.targetCallID);

        this.props.hideSwitchCallModal();
        const win = window.opener ? window.opener : window;
        win.callsClient?.disconnect();
        win.postMessage({type: 'connectCall', channelID: this.props.currentChannel?.id}, win.origin);
    };

    componentDidMount() {
        document.addEventListener('keyup', this.keyboardClose, true);
        document.addEventListener('click', this.closeOnBlur, true);
    }

    componentWillUnmount() {
        document.removeEventListener('keyup', this.keyboardClose, true);
        document.removeEventListener('click', this.closeOnBlur, true);
    }

    render() {
        const {formatMessage} = this.props.intl;

        if (!this.props.show || !this.props.connectedChannel) {
            return null;
        }

        let message1;
        if (isDMChannel(this.props.connectedChannel)) {
            message1 = (<React.Fragment>
                {formatMessage({defaultMessage: 'You\'re already in a call with {participant}.'}, {
                    participant: (
                        <span style={{fontWeight: 600}}>{getUserDisplayName(this.props.connectedDMUser)}</span>),
                })}
            </React.Fragment>);
        } else if (isGMChannel(this.props.connectedChannel)) {
            message1 = (<React.Fragment>
                {formatMessage({defaultMessage: 'You\'re already in a call with {participants}.'}, {
                    participants: (<span style={{fontWeight: 600}}>{this.props.connectedChannel.display_name}</span>),
                })}
            </React.Fragment>);
        } else {
            message1 = (<React.Fragment>
                {formatMessage({defaultMessage: 'You\'re already in a call in {channel}.'}, {
                    channel: (<span style={{fontWeight: 600}}>{this.props.connectedChannel.display_name}</span>),
                })}
            </React.Fragment>);
        }

        let message2;
        if (isDMChannel(this.props.currentChannel)) {
            message2 = (<React.Fragment>
                {formatMessage({defaultMessage: 'Do you want to leave and join a call with {user}?'}, {
                    user: (<span style={{fontWeight: 600}}>{getUserDisplayName(this.props.currentDMUser)}</span>),
                })}
            </React.Fragment>);
        } else if (isGMChannel(this.props.currentChannel)) {
            message2 = (<React.Fragment>
                {formatMessage({defaultMessage: 'Do you want to leave and join a call with {users}?'}, {
                    users: (<span style={{fontWeight: 600}}>{this.props.currentChannel?.display_name}</span>),
                })}
            </React.Fragment>);
        } else {
            message2 = (<React.Fragment>
                {formatMessage({defaultMessage: 'Do you want to leave and join a call in {channel}?'}, {
                    channel: (<span style={{fontWeight: 600}}>{this.props.currentChannel?.display_name}</span>),
                })}
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
                        onClick={this.props.hideSwitchCallModal}
                    >
                        <CompassIcon icon='close'/>
                    </button>
                    <div style={this.style.header as CSSProperties}>
                        <span style={this.style.title}>
                            {formatMessage({defaultMessage: 'You\'re already in a call'})}
                        </span>
                    </div>
                    <div style={this.style.body as CSSProperties}>
                        {message1}
                        {untranslatable(' ')}
                        {message2}
                    </div>
                    <div style={this.style.footer}>
                        <button
                            className='style--none switch-call-modal-cancel'
                            onClick={this.props.hideSwitchCallModal}
                        >{formatMessage({defaultMessage: 'Cancel'})}</button>
                        <button
                            className='style--none switch-call-modal-join'
                            onClick={this.joinCall}
                        >{formatMessage({defaultMessage: 'Leave and join new call'})}</button>
                    </div>
                </div>
            </div>
        );
    }
}
