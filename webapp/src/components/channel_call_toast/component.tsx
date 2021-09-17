import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';

import {Channel} from 'mattermost-redux/types/channels';

import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import ActiveCallIcon from 'components/icons/active_call_icon';

import {newClient} from '../../connection';

import Avatar, {TAvatarSizeToken} from '../avatar';

export default class ChannelCallToast extends React.PureComponent {
    static propTypes = {
        currChannelID: PropTypes.string,
        connectedID: PropTypes.string,
        hasCall: PropTypes.bool.isRequired,
        pictures: PropTypes.array,
        profiles: PropTypes.array,
    }

    constructor(props) {
        super(props);
        this.state = {
            hidden: false,
        };
    }

    onJoinCallClick = async () => {
        if (this.props.connectedID) {
            return;
        }

        try {
            window.voiceClient = await newClient(this.props.currChannelID);
        } catch (err) {
            console.log(err);
        }
    }

    onDismissClick = () => {
        this.setState({hidden: true});
    }

    renderProfiles = () => {
        return this.props.profiles.map((profile, idx) => {
            return (
                <OverlayTrigger
                    placement='bottom'
                    key={'call_toast_profile_' + profile.id}
                    overlay={
                        <Tooltip id='tooltip-username'>
                            { profile.username }
                        </Tooltip>
                    }
                >

                    <Avatar
                        size='sm'
                        url={this.props.pictures[idx]}
                    />

                </OverlayTrigger>
            );
        });
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
                        <span style={{opacity: '0.80', margin: '0 4px'}}>{'Started X minutes ago'}</span>
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
                    {this.renderProfiles()}
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

