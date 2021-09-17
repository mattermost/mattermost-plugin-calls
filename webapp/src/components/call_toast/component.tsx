import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';

import {Channel} from 'mattermost-redux/types/channels';

import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';

import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import {newClient} from '../../connection';

import Avatar, {TAvatarSizeToken} from '../avatar';

export default class CallToast extends React.PureComponent {
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
                        <svg
                            style={{margin: '0 4px'}}
                            width='16'
                            height='11'
                            viewBox='0 0 16 11'
                            fill='none'
                            xmlns='http://www.w3.org/2000/svg'
                        >
                            <path
                                d='M2.69141 0.241455C2.01172 0.94458 1.47266 1.75317 1.07422 2.66724C0.699219 3.5813 0.511719 4.54224 0.511719 5.55005C0.511719 6.55786 0.699219 7.5188 1.07422 8.43286C1.47266 9.34692 2.01172 10.1555 2.69141 10.8586L3.74609 9.80396C3.20703 9.24146 2.77344 8.59692 2.44531 7.87036C2.14062 7.1438 1.98828 6.37036 1.98828 5.55005C1.98828 4.72974 2.14062 3.9563 2.44531 3.22974C2.77344 2.50317 3.20703 1.85864 3.74609 1.29614L2.69141 0.241455ZM13.3086 0.241455L12.2539 1.29614C12.793 1.85864 13.2148 2.50317 13.5195 3.22974C13.8477 3.9563 14.0117 4.72974 14.0117 5.55005C14.0117 6.37036 13.8477 7.1438 13.5195 7.87036C13.2148 8.59692 12.793 9.24146 12.2539 9.80396L13.3086 10.8586C13.9883 10.1555 14.5156 9.34692 14.8906 8.43286C15.2891 7.5188 15.4883 6.55786 15.4883 5.55005C15.4883 4.54224 15.2891 3.5813 14.8906 2.66724C14.5156 1.75317 13.9883 0.94458 13.3086 0.241455ZM4.83594 2.38599C4.41406 2.78442 4.08594 3.26489 3.85156 3.82739C3.61719 4.36646 3.5 4.94067 3.5 5.55005C3.5 6.15942 3.61719 6.74536 3.85156 7.30786C4.08594 7.84692 4.41406 8.31567 4.83594 8.71411L5.89062 7.65942C5.30469 7.07349 5.01172 6.37036 5.01172 5.55005C5.01172 4.72974 5.30469 4.02661 5.89062 3.44067L4.83594 2.38599ZM11.1641 2.38599L10.1094 3.44067C10.6953 4.02661 10.9883 4.72974 10.9883 5.55005C10.9883 6.37036 10.6953 7.07349 10.1094 7.65942L11.1641 8.71411C11.5859 8.31567 11.9141 7.84692 12.1484 7.30786C12.3828 6.74536 12.5 6.15942 12.5 5.55005C12.5 4.94067 12.3828 4.36646 12.1484 3.82739C11.9141 3.26489 11.5859 2.78442 11.1641 2.38599ZM8 4.03833C7.57812 4.03833 7.21484 4.19067 6.91016 4.49536C6.62891 4.77661 6.48828 5.12817 6.48828 5.55005C6.48828 5.97192 6.62891 6.33521 6.91016 6.63989C7.21484 6.92114 7.57812 7.06177 8 7.06177C8.42188 7.06177 8.77344 6.92114 9.05469 6.63989C9.35938 6.33521 9.51172 5.97192 9.51172 5.55005C9.51172 5.12817 9.35938 4.77661 9.05469 4.49536C8.77344 4.19067 8.42188 4.03833 8 4.03833Z'
                                fill='white'
                            />
                        </svg>

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

