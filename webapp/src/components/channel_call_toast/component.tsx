import React from 'react';
import {IntlShape} from 'react-intl';
import moment from 'moment-timezone';

import {UserProfile} from '@mattermost/types/users';

import ActiveCallIcon from '../../components/icons/active_call_icon';
import ConnectedProfiles from '../../components/connected_profiles';

interface Props {
    intl: IntlShape,
    currChannelID: string,
    connectedID?: string,
    hasCall: boolean,
    startAt?: number,
    pictures: string[],
    profiles: UserProfile[],
    isLimitRestricted: boolean,
}

interface State {
    hidden: boolean,
    connectedID?: string,
    intervalID?: NodeJS.Timer,
}

export default class ChannelCallToast extends React.PureComponent<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hidden: false,
        };
    }

    public componentDidMount() {
        // This is needed to force a re-render to periodically update
        // the start time.
        const id = setInterval(() => this.forceUpdate(), 60000);
        // eslint-disable-next-line react/no-did-mount-set-state
        this.setState({
            intervalID: id,
        });
    }

    public componentWillUnmount() {
        if (this.state.intervalID) {
            clearInterval(this.state.intervalID);
        }
    }

    onJoinCallClick = async () => {
        if (this.props.connectedID) {
            return;
        }
        window.postMessage({type: 'connectCall', channelID: this.props.currChannelID}, window.origin);
    };

    onDismissClick = () => {
        this.setState({hidden: true});
    };

    render() {
        const {formatMessage} = this.props.intl;

        if (!this.props.hasCall || this.state.hidden || this.props.isLimitRestricted) {
            return null;
        }

        return (
            <div
                id='calls-channel-toast'
                className='toast toast__visible'
                style={{backgroundColor: '#339970'}}
            >
                <div
                    className='toast__message toast__pointer'
                    onClick={this.onJoinCallClick}
                >
                    <div style={{position: 'absolute'}}>
                        <ActiveCallIcon
                            fill='white'
                            style={{margin: '0 4px'}}
                        />
                        <span style={{margin: '0 4px'}}>{formatMessage({defaultMessage: 'Join Call'})}</span>
                        <span style={{opacity: '0.80', margin: '0 4px'}}>
                            {formatMessage({defaultMessage: 'Started {callStartedAt}'}, {callStartedAt: moment(this.props.startAt).fromNow()})}
                        </span>
                        <div/>
                    </div>
                </div>

                <div
                    style={
                        {position: 'absolute',

                            display: 'flex',
                            alignItems: 'center',
                            height: '100%',
                            right: '40px'}
                    }
                >
                    <ConnectedProfiles
                        profiles={this.props.profiles}
                        pictures={this.props.pictures}
                        size={24}
                        fontSize={10}
                        border={false}
                        maxShowedProfiles={2}
                    />
                </div>

                <div
                    className='toast__dismiss'
                    onClick={this.onDismissClick}
                >
                    <span className='close-btn'>
                        <svg
                            width='24px'
                            height='24px'
                            viewBox='0 0 24 24'
                            role='img'
                            aria-label={formatMessage({defaultMessage: 'Close Icon'})}
                        >
                            <path
                                fillRule='nonzero'
                                d='M18 7.209L16.791 6 12 10.791 7.209 6 6 7.209 10.791 12 6 16.791 7.209 18 12 13.209 16.791 18 18 16.791 13.209 12z'
                            />
                        </svg>
                    </span>
                </div>
            </div>
        );
    }
}

