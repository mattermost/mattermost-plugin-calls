import './component.scss';

import {Channel} from '@mattermost/types/channels';
import {UserProfile} from '@mattermost/types/users';
import React, {CSSProperties} from 'react';
import {IntlShape} from 'react-intl';
import {endCall} from 'src/actions';
import CompassIcon from 'src/components/icons/compassIcon';
import {logErr} from 'src/log';
import {getUserDisplayName, isDMChannel, isGMChannel} from 'src/utils';

interface Props {
    intl: IntlShape,
    show: boolean,
    channel?: Channel,
    connectedDMUser: UserProfile | undefined,
    numParticipants: number,
    hideEndCallModal: () => void,
}

interface State {
    errorMsg: string,
}

export default class EndCallModal extends React.PureComponent<Props, State> {
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
        error: {
            marginTop: '8px',
            color: 'var(--error-text)',
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
    };

    private closeOnBlur = (e: Event) => {
        if (!this.props.show) {
            return;
        }
        if (this.node?.current && e.target && this.node.current.contains(e.target as Node)) {
            return;
        }
        this.hideModal();
    };

    private endCall = () => {
        if (!this.props.channel) {
            logErr('missing channel');
            return;
        }

        endCall(this.props.channel.id).then(() => {
            this.hideModal();
        }).catch((err: any) => {
            this.setState({
                errorMsg: err.response && err.response.data ? err.response.data.err : err.toString(),
            });
        });
    };

    private hideModal = () => {
        this.setState({errorMsg: ''});
        this.props.hideEndCallModal();
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

        if (!this.props.show || !this.props.channel) {
            return null;
        }

        // @ts-ignore
        const dmMsg = formatMessage({defaultMessage: 'Are you sure you want to end a call with <participant>{name}</participant>?'},
            {
                name: getUserDisplayName(this.props.connectedDMUser),
                participant: (name: string) => (<span style={{fontWeight: 600}}>{name}</span>),
            });

        // @ts-ignore
        const gmMsg = formatMessage({defaultMessage: 'Are you sure you want to end a call with <participants>{names}</participants>?'},
            {
                names: this.props.channel.display_name,
                participants: (names: string) => (<span style={{fontWeight: 600}}>{names}</span>),
            });
        let msg;
        if (isDMChannel(this.props.channel)) {
            msg = (<React.Fragment>
                {dmMsg}
            </React.Fragment>);
        } else if (isGMChannel(this.props.channel)) {
            msg = (<React.Fragment>
                {gmMsg}
            </React.Fragment>);
        } else {
            msg = (<React.Fragment>
                {formatMessage({defaultMessage: 'Are you sure you want to end a call with {count, plural, =1 {# participant} other {# participants}} in {channelName}?'},
                    {count: this.props.numParticipants, channelName: this.props.channel.display_name})}
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
                            {formatMessage({defaultMessage: 'End call'})}
                        </span>
                    </div>
                    <div style={this.style.body as CSSProperties}>
                        {msg}
                    </div>

                    {this.state.errorMsg &&
                        <div style={this.style.error as CSSProperties}>
                            {formatMessage({defaultMessage: 'An error has occurred: {errorMsg}'}, {errorMsg: this.state.errorMsg})}
                        </div>
                    }

                    <div style={this.style.footer}>
                        <button
                            className='style--none end-call-modal-cancel'
                            onClick={this.hideModal}
                        >{formatMessage({defaultMessage: 'Cancel'})}</button>
                        <button
                            className='style--none end-call-modal-confirm'
                            onClick={this.endCall}
                        >{formatMessage({defaultMessage: 'End call'})}</button>
                    </div>
                </div>
            </div>
        );
    }
}
