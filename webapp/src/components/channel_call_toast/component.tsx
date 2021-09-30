import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';

import {Channel} from 'mattermost-redux/types/channels';

import moment from 'moment-timezone';

import {newClient} from '../../connection';

import ActiveCallIcon from 'components/icons/active_call_icon';
import ConnectedProfiles from 'components/connected_profiles';

export default class ChannelCallToast extends React.PureComponent {
    static propTypes = {
        currChannelID: PropTypes.string,
        connectedID: PropTypes.string,
        hasCall: PropTypes.bool.isRequired,
        startAt: PropTypes.number,
        pictures: PropTypes.array,
        profiles: PropTypes.array,
    }

    constructor(props) {
        super(props);
        this.state = {
            hidden: false,
        };
    }

    public componentDidMount() {
        // This is needed to force a re-render to periodically update
        // the start time.
        const id = setInterval(() => this.forceUpdate(), 60000);
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

        try {
            window.callsClient = await newClient(this.props.currChannelID);
        } catch (err) {
            console.log(err);
        }
    }

    onDismissClick = () => {
        this.setState({hidden: true});
    }

    render() {
        if (!this.props.hasCall || this.state.hidden) {
            return null;
        }
        return (
            <div
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
                        <span style={{margin: '0 4px'}}>{'Join Call'}</span>
                        <span style={{opacity: '0.80', margin: '0 4px'}}>{`Started ${moment(this.props.startAt).fromNow()}`}</span>
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
                        size='sm'
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
                            aria-label='Close Icon'
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

