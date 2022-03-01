import React, {CSSProperties} from 'react';
import moment from 'moment-timezone';

import {UserProfile} from 'mattermost-redux/types/users';
import {Post} from 'mattermost-redux/types/posts';

import {changeOpacity} from 'mattermost-redux/utils/theme_utils';

import ActiveCallIcon from '../../components/icons/active_call_icon';
import CallIcon from '../../components/icons/call_icon';
import LeaveCallIcon from '../../components/icons/leave_call_icon';
import ConnectedProfiles from '../../components/connected_profiles';

interface Props {
    theme: any,
    post: Post,
    connectedID: string,
    hasCall: boolean,
    pictures: string[],
    profiles: UserProfile[],
    showSwitchCallModal: (targetID: string) => void,
}

export default class PostType extends React.PureComponent<Props> {
    private style = {
        main: {
            display: 'flex',
            alignItems: 'center',
            width: 'min(600px, 100%)',
            padding: '16px',
            background: this.props.theme.centerChannelBg,
            border: `1px solid ${changeOpacity(this.props.theme.centerChannelColor, 0.16)}`,
            boxShadow: `0px 4px 6px ${changeOpacity(this.props.theme.centerChannelColor, 0.12)}`,
            color: this.props.theme.centerChannelColor,
            borderRadius: '4px',
            margin: '4px 0',
            flexWrap: 'wrap',
            rowGap: '8px',
        },
        callIcon: {
            background: '#339970',
            borderRadius: '4px',
            padding: '10px',
            width: '40px',
            height: '40px',
        },
        callEndedIcon: {
            background: changeOpacity(this.props.theme.centerChannelColor, 0.16),
            borderRadius: '4px',
            padding: '10px',
            width: '40px',
            height: '40px',
        },
        messageWrapper: {
            display: 'flex',
            flexDirection: 'column',
            margin: '0 12px',
        },
        message: {
            fontWeight: 600,
        },
        duration: {
            color: this.props.theme.centerChannelColor,
        },
        joinButton: {
            display: 'flex',
            alignItems: 'center',
            color: '#FFFFFF',
            background: '#339970',
            borderRadius: '4px',
            padding: '10px 16px',
        },
        leaveButton: {
            display: 'flex',
            alignItems: 'center',
            color: 'rgba(210, 75, 78, 1)',
            background: 'rgba(210, 75, 78, 0.1)',
            borderRadius: '4px',
            padding: '10px 16px',
        },
        profiles: {
            display: 'flex',
            alignItems: 'center',
            marginLeft: 'auto',
        },
    };

    onJoinCallClick = async () => {
        if (this.props.connectedID) {
            this.props.showSwitchCallModal(this.props.post.channel_id);
            return;
        }
        window.postMessage({type: 'connectCall', channelID: this.props.post.channel_id}, window.origin);
    }

    onLeaveButtonClick = () => {
        if (window.callsClient) {
            window.callsClient.disconnect();
        }
    }

    render() {
        const subMessage = this.props.post.props.end_at ? (
            <div>
                <span style={this.style.duration}>
                    {`Ended at ${moment(this.props.post.props.end_at).format('h:mm A')}`}
                </span>
                <span style={{margin: '0 4px'}}>{'•'}</span>
                <span style={this.style.duration}>
                    {`Lasted ${moment.duration(this.props.post.props.end_at - this.props.post.props.start_at).humanize(false)}`}
                </span>
            </div>
        ) : (
            <span style={this.style.duration}>{moment(this.props.post.props.start_at).fromNow()}</span>
        );

        return (
            <div
                className='call-thread'
                style={this.style.main as CSSProperties}
            >
                <div style={{display: 'flex', alignItems: 'center', width: '100%'}}>
                    <div style={this.props.post.props.end_at ? this.style.callEndedIcon : this.style.callIcon}>
                        {!this.props.post.props.end_at &&
                            <ActiveCallIcon
                                fill='#FFFFFF'
                                style={{width: '100%', height: '100%'}}
                            />
                        }
                        {this.props.post.props.end_at &&
                            <LeaveCallIcon
                                fill={changeOpacity(this.props.theme.centerChannelColor, 0.56)}
                                style={{width: '100%', height: '100%'}}
                            />
                        }
                    </div>
                    <div style={this.style.messageWrapper as CSSProperties}>
                        <span style={this.style.message}>{this.props.post.message}</span>
                        {subMessage}
                    </div>

                    {
                        !this.props.post.props.end_at &&

                        <div style={this.style.profiles}>
                            <ConnectedProfiles
                                profiles={this.props.profiles}
                                pictures={this.props.pictures}
                                size={32}
                                fontSize={12}
                                maxShowedProfiles={2}
                            />
                        </div>
                    }
                    {
                        !this.props.post.props.end_at && (!this.props.connectedID || this.props.connectedID !== this.props.post.channel_id) &&
                        <button
                            className='cursor--pointer style--none'
                            style={this.style.joinButton}
                            onClick={this.onJoinCallClick}
                        >
                            <CallIcon fill='#FFFFFF'/>
                            <span style={{fontWeight: 600, margin: '0 8px'}}>{'Join call'}</span>
                        </button>
                    }
                    {
                        !this.props.post.props.end_at && this.props.connectedID && this.props.connectedID === this.props.post.channel_id &&

                        <button
                            className='cursor--pointer style--none'
                            style={this.style.leaveButton}
                            onClick={this.onLeaveButtonClick}
                        >
                            <LeaveCallIcon fill='rgba(210, 75, 78, 1)'/>
                            <span style={{fontWeight: 600, margin: '0 8px'}}>{'Leave call'}</span>
                        </button>
                    }
                </div>
            </div>
        );
    }
}
