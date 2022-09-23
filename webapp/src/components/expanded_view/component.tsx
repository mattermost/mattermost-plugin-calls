/* eslint-disable max-lines */
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';
import {compareSemVer} from 'semver-parser';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import Picker from '@emoji-mart/react';

import {getEmojiImageUrl} from 'mattermost-redux/utils/emoji_utils';

import {UserProfile} from '@mattermost/types/users';
import {Channel} from '@mattermost/types/channels';

import {getUserDisplayName, getScreenStream, isDMChannel, hasExperimentalFlag} from 'src/utils';
import {EmojiData, ReactionWithUser, UserState} from 'src/types/types';
import * as Telemetry from 'src/types/telemetry';

import {Emojis, EmojiIndicesByUnicode} from 'src/emoji';

import Avatar from '../avatar/avatar';
import {ReactionStream} from '../reaction_stream/reaction_stream';
import {Emoji} from '../emoji/emoji';
import CompassIcon from '../../components/icons/compassIcon';
import LeaveCallIcon from '../../components/icons/leave_call_icon';
import MutedIcon from '../../components/icons/muted_icon';
import UnmutedIcon from '../../components/icons/unmuted_icon';
import ScreenIcon from '../../components/icons/screen_icon';
import RaisedHandIcon from '../../components/icons/raised_hand';
import UnraisedHandIcon from '../../components/icons/unraised_hand';
import SmileyIcon from '../../components/icons/smiley_icon';
import ParticipantsIcon from '../../components/icons/participants';
import CallDuration from '../call_widget/call_duration';
import Shortcut from 'src/components/shortcut';

import {
    MUTE_UNMUTE,
    RAISE_LOWER_HAND,
    SHARE_UNSHARE_SCREEN,
    PARTICIPANTS_LIST_TOGGLE,
    LEAVE_CALL,
    PUSH_TO_TALK,
    keyToAction,
    reverseKeyMappings,
    MAKE_REACTION,
} from 'src/shortcuts';

import './component.scss';

const EMOJI_VERSION = '13';

const EMOJI_SKINTONE_MAP = new Map([[1, ''], [2, '1F3FB'], [3, '1F3FC'], [4, '1F3FD'], [5, '1F3FE'], [6, '1F3FF']]);

interface Props {
    show: boolean,
    currentUserID: string,
    profiles: UserProfile[],
    pictures: {
        [key: string]: string,
    },
    statuses: {
        [key: string]: UserState,
    },
    reactions: ReactionWithUser[],
    callStartAt: number,
    hideExpandedView: () => void,
    showScreenSourceModal: () => void,
    screenSharingID: string,
    channel: Channel,
    connectedDMUser: UserProfile | undefined,
    trackEvent: (event: Telemetry.Event, source: Telemetry.Source, props?: Record<string, any>) => void,
}

interface State {
    screenStream: MediaStream | null,
    showParticipantsList: boolean,
    showEmojiPicker: boolean
}

export default class ExpandedView extends React.PureComponent<Props, State> {
    private screenPlayer = React.createRef<HTMLVideoElement>()
    private pushToTalk = false;

    constructor(props: Props) {
        super(props);
        this.screenPlayer = React.createRef();
        this.state = {
            screenStream: null,
            showParticipantsList: false,
            showEmojiPicker: false,
        };

        if (window.opener) {
            const callsClient = window.opener.callsClient;
            callsClient.on('close', () => window.close());
        }
    }

    getCallsClient = () => {
        return window.opener ? window.opener.callsClient : window.callsClient;
    }

    handleBlur = () => {
        if (this.pushToTalk) {
            this.getCallsClient()?.mute();
            this.pushToTalk = false;
            this.forceUpdate();
        }
    }

    handleKeyUp = (ev: KeyboardEvent) => {
        if (keyToAction('popout', ev) === PUSH_TO_TALK && this.pushToTalk) {
            this.getCallsClient()?.mute();
            this.pushToTalk = false;
            this.forceUpdate();
        }
    }

    toggleEmojiPicker = () => {
        this.setState((prevState) => ({
            showEmojiPicker: !prevState.showEmojiPicker,
        }));
    }

    handleUserPicksEmoji = (ev: any) => {
        const callsClient = this.getCallsClient();
        const emojiData = {
            name: ev.id,
            skin: ev.skin ? EMOJI_SKINTONE_MAP.get(ev.skin) : null,
            unified: ev.unified.toUpperCase(),
        };
        callsClient.sendUserReaction(emojiData);
    }

    handleKBShortcuts = (ev: KeyboardEvent) => {
        if ((!this.props.show || !window.callsClient) && !window.opener) {
            return;
        }

        switch (keyToAction('popout', ev)) {
        case PUSH_TO_TALK:
            if (this.pushToTalk) {
                return;
            }
            this.getCallsClient()?.unmute();
            this.pushToTalk = true;
            this.forceUpdate();
            break;
        case MUTE_UNMUTE:
            this.onMuteToggle();
            break;
        case RAISE_LOWER_HAND:
            this.onRaiseHandToggle(true);
            break;
        case MAKE_REACTION:
            this.toggleEmojiPicker();
            break;
        case SHARE_UNSHARE_SCREEN:
            this.onShareScreenToggle(true);
            break;
        case PARTICIPANTS_LIST_TOGGLE:
            this.onParticipantsListToggle(true);
            break;
        case LEAVE_CALL:
            this.onDisconnectClick();
            break;
        }
    }

    onDisconnectClick = () => {
        this.props.hideExpandedView();
        const callsClient = this.getCallsClient();
        if (callsClient) {
            callsClient.disconnect();
            if (window.opener) {
                window.close();
            }
        }
    }

    getEmojiURL = (emoji: EmojiData) => {
        const index = EmojiIndicesByUnicode.get(emoji.unified.toLowerCase());
        if (typeof index === 'undefined') {
            return '';
        }
        return getEmojiImageUrl(Emojis[index]);
    }

    onMuteToggle = () => {
        if (this.pushToTalk) {
            return;
        }
        const callsClient = this.getCallsClient();
        if (callsClient.isMuted()) {
            callsClient.unmute();
        } else {
            callsClient.mute();
        }
    }

    onShareScreenToggle = async (fromShortcut?: boolean) => {
        const callsClient = this.getCallsClient();
        if (this.props.screenSharingID === this.props.currentUserID) {
            callsClient.unshareScreen();
            this.setState({
                screenStream: null,
            });
            this.props.trackEvent(Telemetry.Event.UnshareScreen, Telemetry.Source.ExpandedView, {initiator: fromShortcut ? 'shortcut' : 'button'});
        } else if (!this.props.screenSharingID) {
            if (window.desktop && compareSemVer(window.desktop.version, '5.1.0') >= 0) {
                this.props.showScreenSourceModal();
            } else {
                const stream = await getScreenStream('', hasExperimentalFlag());
                if (window.opener && stream) {
                    window.screenSharingTrackId = stream.getVideoTracks()[0].id;
                }
                callsClient.setScreenStream(stream);
                this.setState({
                    screenStream: stream,
                });
            }
            this.props.trackEvent(Telemetry.Event.ShareScreen, Telemetry.Source.ExpandedView, {initiator: fromShortcut ? 'shortcut' : 'button'});
        }
    }

    onRaiseHandToggle = (fromShortcut?: boolean) => {
        const callsClient = this.getCallsClient();
        if (callsClient.isHandRaised) {
            this.props.trackEvent(Telemetry.Event.LowerHand, Telemetry.Source.ExpandedView, {initiator: fromShortcut ? 'shortcut' : 'button'});
            callsClient.unraiseHand();
        } else {
            this.props.trackEvent(Telemetry.Event.RaiseHand, Telemetry.Source.ExpandedView, {initiator: fromShortcut ? 'shortcut' : 'button'});
            callsClient.raiseHand();
        }
    }

    renderEmojiPicker = () => {
        return this.state.showEmojiPicker ? (
            <div style={style.emojiPickerContainer as CSSProperties}>
                <Picker
                    emojiVersion={EMOJI_VERSION}
                    skinTonePosition='search'
                    onEmojiSelect={this.handleUserPicksEmoji}
                    onClickOutside={this.toggleEmojiPicker}
                />
            </div>
        ) : null;
    }

    onParticipantsListToggle = (fromShortcut?: boolean) => {
        const event = this.state.showParticipantsList ? Telemetry.Event.CloseParticipantsList : Telemetry.Event.OpenParticipantsList;
        this.props.trackEvent(event, Telemetry.Source.ExpandedView, {initiator: fromShortcut ? 'shortcut' : 'button'});
        this.setState({
            showParticipantsList: !this.state.showParticipantsList,
        });
    }

    onCloseViewClick = () => {
        this.props.trackEvent(Telemetry.Event.CloseExpandedView, Telemetry.Source.ExpandedView, {initiator: 'button'});
        this.props.hideExpandedView();
    }

    public componentDidUpdate(prevProps: Props, prevState: State) {
        if (window.opener) {
            if (document.title.indexOf('Call') === -1 && this.props.channel) {
                if (isDMChannel(this.props.channel) && this.props.connectedDMUser) {
                    document.title = `Call - ${getUserDisplayName(this.props.connectedDMUser)}`;
                } else if (!isDMChannel(this.props.channel)) {
                    document.title = `Call - ${this.props.channel.display_name}`;
                }
            }
        }

        if (this.state.screenStream && this.screenPlayer.current && this.screenPlayer?.current.srcObject !== this.state.screenStream) {
            this.screenPlayer.current.srcObject = this.state.screenStream;
        }

        const callsClient = this.getCallsClient();
        if (!this.state.screenStream && callsClient?.getLocalScreenStream()) {
            // eslint-disable-next-line react/no-did-update-set-state
            this.setState({screenStream: callsClient.getLocalScreenStream()});
        }
    }

    public componentDidMount() {
        // keyboard shortcuts
        window.addEventListener('keydown', this.handleKBShortcuts, true);
        window.addEventListener('keyup', this.handleKeyUp, true);
        window.addEventListener('blur', this.handleBlur, true);

        const callsClient = this.getCallsClient();
        callsClient.on('remoteScreenStream', (stream: MediaStream) => {
            this.setState({
                screenStream: stream,
            });
        });

        const screenStream = callsClient.getLocalScreenStream() || callsClient.getRemoteScreenStream();

        // eslint-disable-next-line react/no-did-mount-set-state
        this.setState({
            screenStream,
        });
    }

    public componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKBShortcuts, true);
        window.removeEventListener('keyup', this.handleKeyUp, true);
        window.removeEventListener('blur', this.handleBlur, true);
    }

    renderScreenSharingPlayer = () => {
        const isSharing = this.props.screenSharingID === this.props.currentUserID;

        let profile;
        if (!isSharing) {
            for (let i = 0; i < this.props.profiles.length; i++) {
                if (this.props.profiles[i].id === this.props.screenSharingID) {
                    profile = this.props.profiles[i];
                    break;
                }
            }
            if (!profile) {
                return null;
            }
        }

        const msg = isSharing ? 'You are sharing your screen' : `You are viewing ${getUserDisplayName(profile as UserProfile)}'s screen`;

        return (
            <div style={style.screenContainer as CSSProperties}>
                <video
                    id='screen-player'
                    ref={this.screenPlayer}
                    width='100%'
                    height='100%'
                    muted={true}
                    autoPlay={true}
                    onClick={(ev) => ev.preventDefault()}
                    controls={true}
                />
                <span
                    style={{
                        background: 'black',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        color: 'white',
                        marginTop: '8px',
                    }}
                >
                    {msg}
                </span>
            </div>
        );
    }

    renderParticipants = () => {
        return this.props.profiles.map((profile, idx) => {
            const status = this.props.statuses[profile.id];
            let isMuted = true;
            let isSpeaking = false;
            let isHandRaised = false;
            let hasReaction = false;
            let emojiURL = '';
            if (status) {
                isMuted = !status.unmuted;
                isSpeaking = Boolean(status.voice);
                isHandRaised = Boolean(status.raised_hand > 0);
                hasReaction = Boolean(status.reaction);

                if (status.reaction) {
                    emojiURL = this.getEmojiURL(status.reaction.emoji);
                }
            }

            const MuteIcon = isMuted ? MutedIcon : UnmutedIcon;

            return (
                <li
                    key={'participants_profile_' + idx}
                    style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', margin: '16px'}}
                >

                    <div style={{position: 'relative'}}>
                        <Avatar
                            size={50}
                            fontSize={18}
                            border={false}
                            borderGlow={isSpeaking}
                            url={this.props.pictures[profile.id]}
                        />
                        <div
                            style={{
                                position: 'absolute',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                bottom: 0,
                                right: 0,
                                background: 'rgba(50, 50, 50, 1)',
                                borderRadius: '30px',
                                width: '20px',
                                height: '20px',
                            }}
                        >
                            <MuteIcon
                                fill={isMuted ? '#C4C4C4' : '#3DB887'}
                                style={{width: '14px', height: '14px'}}
                                stroke={isMuted ? '#C4C4C4' : ''}
                            />
                        </div>
                        {isHandRaised &&
                        <>
                            <div style={style.reactionBackground as CSSProperties}/>
                            <div style={style.handRaisedContainer as CSSProperties}>
                                {'🤚'}
                            </div>
                        </>
                        }
                        {!isHandRaised && hasReaction && status.reaction &&
                        <>
                            <div style={style.reactionBackground as CSSProperties}/>
                            <div style={style.reactionContainer as CSSProperties}>
                                <Emoji emoji={status.reaction.emoji}/>
                            </div>
                        </>
                        }
                    </div>

                    <span style={{fontWeight: 600, fontSize: '12px', margin: '8px 0'}}>
                        {getUserDisplayName(profile)}{profile.id === this.props.currentUserID && ' (you)'}
                    </span>

                </li>
            );
        });
    }

    renderParticipantsRHSList = () => {
        return this.props.profiles.map((profile, idx) => {
            const status = this.props.statuses[profile.id];
            let isMuted = true;
            let isSpeaking = false;
            let isHandRaised = false;
            if (status) {
                isMuted = !status.unmuted;
                isSpeaking = Boolean(status.voice);
                isHandRaised = Boolean(status.raised_hand > 0);
            }

            const MuteIcon = isMuted ? MutedIcon : UnmutedIcon;

            return (
                <li
                    key={'participants_rhs_profile_' + idx}
                    style={{display: 'flex', alignItems: 'center', padding: '4px 8px'}}
                >
                    <Avatar
                        size={24}
                        fontSize={10}
                        border={false}
                        borderGlow={isSpeaking}
                        url={this.props.pictures[profile.id]}
                        style={{
                            marginRight: '8px',
                        }}
                    />
                    <span style={{fontWeight: 600, fontSize: '12px', margin: '8px 0'}}>
                        {getUserDisplayName(profile)}{profile.id === this.props.currentUserID && ' (you)'}
                    </span>

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            marginLeft: 'auto',
                            gap: '4px',
                        }}
                    >
                        { isHandRaised &&
                            <RaisedHandIcon
                                fill={'rgba(255, 188, 66, 1)'}
                                style={{width: '14px', height: '14px'}}
                            />
                        }

                        { this.props.screenSharingID === profile.id &&
                        <ScreenIcon
                            fill={'rgb(var(--dnd-indicator-rgb))'}
                            style={{width: '14px', height: '14px'}}
                        />
                        }

                        <MuteIcon
                            fill={isMuted ? '#C4C4C4' : '#3DB887'}
                            style={{width: '14px', height: '14px'}}
                            stroke={isMuted ? '#C4C4C4' : ''}
                        />

                    </div>
                </li>
            );
        });
    }

    render() {
        if ((!this.props.show || !window.callsClient) && !window.opener) {
            return null;
        }

        const callsClient = this.getCallsClient();
        if (!callsClient) {
            return null;
        }

        const isMuted = callsClient.isMuted();
        const MuteIcon = isMuted ? MutedIcon : UnmutedIcon;
        const muteButtonText = isMuted ? 'Unmute' : 'Mute';

        const isHandRaised = callsClient.isHandRaised;
        const HandIcon = isHandRaised ? UnraisedHandIcon : RaisedHandIcon;
        const raiseHandText = isHandRaised ? 'Lower hand' : 'Raise hand';
        const participantsText = 'Show participants list';

        const sharingID = this.props.screenSharingID;
        const currentID = this.props.currentUserID;
        const isSharing = sharingID === currentID;

        // building the list here causes a bug tht if a user leaves and recently reacted it will show as blank
        const profileMap: {[key: string]: UserProfile;} = {};
        this.props.profiles.forEach((profile) => {
            profileMap[profile.id] = profile;
        });
        const handsup: string[] = [];
        for (const [id, member] of Object.entries(this.props.statuses)) {
            if (member.raised_hand) {
                handsup.push(id);
            }
        }

        return (
            <div
                id='calls-expanded-view'
                style={style.root as CSSProperties}
            >
                <div style={style.main as CSSProperties}>
                    <div style={{display: 'flex', width: '100%'}}>
                        <div style={style.topLeftContainer as CSSProperties}>
                            <CallDuration
                                style={{margin: '4px'}}
                                startAt={this.props.callStartAt}
                            />
                            <span style={{margin: '4px'}}>{'•'}</span>
                            <span style={{margin: '4px'}}>{`${this.props.profiles.length} participants`}</span>

                        </div>
                        {
                            !window.opener &&
                            <button
                                className='button-close'
                                style={style.closeViewButton as CSSProperties}
                                onClick={this.onCloseViewClick}
                            >
                                <CompassIcon icon='arrow-collapse'/>
                            </button>
                        }
                    </div>
                    { !this.props.screenSharingID &&
                        <div style={{flex: 1, display: 'flex', flexDirection: 'row'}}>
                            <ReactionStream
                                reactions={this.props.reactions}
                                currentUserID={this.props.currentUserID}
                                profiles={profileMap}
                                handsup={handsup}
                            />
                            <ul
                                id='calls-expanded-view-participants-grid'
                                style={{
                                    ...style.participants,
                                    gridTemplateColumns: `repeat(${Math.min(this.props.profiles.length, 4)}, 1fr)`,
                                }}
                            >
                                { this.renderParticipants() }
                            </ul>
                        </div>
                    }
                    { this.props.screenSharingID && this.renderScreenSharingPlayer() }
                    <div
                        id='calls-expanded-view-controls'
                        style={style.controls}
                    >
                        <div style={style.leftControls}>
                            <OverlayTrigger
                                key='show_participants_list'
                                placement='top'
                                overlay={
                                    <Tooltip
                                        id='show-participants-list'
                                    >
                                        {this.state.showParticipantsList ? 'Hide participants list' : 'Show participants list'}
                                        <Shortcut shortcut={reverseKeyMappings.popout[PARTICIPANTS_LIST_TOGGLE][0]}/>
                                    </Tooltip>
                                }
                            >

                                <button
                                    className='button-center-controls'
                                    onClick={() => this.onParticipantsListToggle()}
                                    style={{background: this.state.showParticipantsList ? 'rgba(28, 88, 217, 0.32)' : '', marginLeft: '0'}}
                                >
                                    <ParticipantsIcon
                                        style={{width: '24px', height: '24px'}}
                                        fill={this.state.showParticipantsList ? 'rgb(28, 88, 217)' : 'white'}
                                    />
                                </button>
                            </OverlayTrigger>
                        </div>

                        <div style={style.centerControls}>
                            <OverlayTrigger
                                key='tooltip-hand-toggle'
                                placement='top'
                                overlay={
                                    <Tooltip
                                        id='tooltip-hand-toggle'
                                    >
                                        <span>{raiseHandText}</span>
                                        <Shortcut shortcut={reverseKeyMappings.popout[RAISE_LOWER_HAND][0]}/>
                                    </Tooltip>
                                }
                            >
                                <button
                                    className='button-center-controls'
                                    onClick={() => this.onRaiseHandToggle()}
                                    style={{background: isHandRaised ? 'rgba(255, 188, 66, 0.16)' : ''}}
                                >
                                    <HandIcon
                                        style={{width: '28px', height: '28px'}}
                                        fill={isHandRaised ? 'rgba(255, 188, 66, 1)' : 'white'}
                                    />
                                </button>
                            </OverlayTrigger>

                            <div style={{position: 'relative'}}>
                                {this.renderEmojiPicker()}
                                <OverlayTrigger
                                    key='tooltip-emoji-picker'
                                    placement='top'
                                    overlay={
                                        <Tooltip
                                            id='tooltip-emoji-picker'
                                        >
                                            <span>{'Add Reaction'}</span>
                                            <Shortcut shortcut={reverseKeyMappings.popout[MAKE_REACTION][0]}/>
                                        </Tooltip>
                                    }
                                >

                                    <button
                                        className='button-center-controls'
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            this.toggleEmojiPicker();
                                        }}
                                        style={{background: this.state.showEmojiPicker ? '#FFFFFF' : '', position: 'relative'}}
                                    >
                                        <SmileyIcon
                                            style={{width: '28px', height: '28px'}}
                                            fill={this.state.showEmojiPicker ? '#3F4350' : '#FFFFFF'}
                                        />
                                    </button>
                                </OverlayTrigger>
                            </div>

                            <OverlayTrigger
                                key='tooltip-screen-toggle'
                                placement='top'
                                overlay={
                                    <Tooltip
                                        id='tooltip-screen-toggle'
                                    >
                                        <span>{isSharing ? 'Stop presenting' : 'Start presenting'}</span>
                                        <Shortcut shortcut={reverseKeyMappings.popout[SHARE_UNSHARE_SCREEN][0]}/>
                                    </Tooltip>
                                }
                            >
                                <button
                                    className='button-center-controls'
                                    onClick={() => this.onShareScreenToggle()}
                                    style={{background: isSharing ? 'rgba(var(--dnd-indicator-rgb), 0.12)' : ''}}
                                >
                                    <ScreenIcon
                                        style={{width: '28px', height: '28px'}}
                                        fill={isSharing ? 'rgb(var(--dnd-indicator-rgb))' : 'white'}
                                    />

                                </button>
                            </OverlayTrigger>

                            <OverlayTrigger
                                key='tooltip-mute-toggle'
                                placement='top'
                                overlay={
                                    <Tooltip
                                        id='tooltip-mute-toggle'
                                    >
                                        <span>{muteButtonText}</span>
                                        <Shortcut shortcut={reverseKeyMappings.popout[MUTE_UNMUTE][0]}/>
                                    </Tooltip>
                                }
                            >
                                <button
                                    id='calls-popout-mute-button'
                                    className='button-center-controls'
                                    onClick={this.onMuteToggle}
                                    style={{background: isMuted ? '' : 'rgba(61, 184, 135, 0.16)'}}
                                >
                                    <MuteIcon
                                        style={{width: '28px', height: '28px'}}
                                        fill={isMuted ? 'white' : 'rgba(61, 184, 135, 1)'}
                                        stroke={isMuted ? 'rgb(var(--dnd-indicator-rgb))' : ''}
                                    />
                                </button>
                            </OverlayTrigger>
                        </div>

                        <div style={{flex: '1', display: 'flex', justifyContent: 'flex-end', marginRight: '16px'}}>
                            <OverlayTrigger
                                key='tooltip-leave-call'
                                placement='top'
                                overlay={
                                    <Tooltip
                                        id='tooltip-leave-call'
                                    >
                                        <span>{'Leave call'}</span>
                                        <Shortcut shortcut={reverseKeyMappings.popout[LEAVE_CALL][0]}/>
                                    </Tooltip>
                                }
                            >
                                <button
                                    className='button-leave'
                                    onClick={this.onDisconnectClick}
                                >

                                    <LeaveCallIcon
                                        style={{width: '24px', height: '24px'}}
                                        fill='white'
                                    />
                                    <span
                                        style={{fontSize: '18px', fontWeight: 600, marginLeft: '8px'}}
                                    >{'Leave'}</span>

                                </button>
                            </OverlayTrigger>
                        </div>
                    </div>
                </div>
                { this.state.showParticipantsList &&
                <ul style={style.rhs as CSSProperties}>
                    <span style={{position: 'sticky', top: '0', background: 'inherit', fontWeight: 600, padding: '8px'}}>{'Participants list'}</span>
                    { this.renderParticipantsRHSList() }
                </ul>
                }
            </div>
        );
    }
}

const style = {
    root: {
        position: 'absolute',
        display: 'flex',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1000,
        background: 'rgba(37, 38, 42, 1)',
        color: 'white',
    },
    main: {
        display: 'flex',
        flexDirection: 'column',
        flex: '1',
    },
    closeViewButton: {
        fontSize: '24px',
        marginLeft: 'auto',
    },
    participants: {
        display: 'grid',
        overflow: 'auto',
        margin: 'auto',
        padding: '0',
    },
    controls: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px 8px',
        width: '100%',
    },
    leftControls: {
        flex: '1',
        marginLeft: '16px',
    },
    centerControls: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 8px',
        width: '112px',
    },
    topLeftContainer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '16px',
        marginRight: 'auto',
        padding: '4px',
    },
    screenContainer: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        margin: 'auto',
        maxWidth: 'calc(100% - 16px)',
        maxHeight: 'calc(100% - 200px)',
    },
    rhs: {
        display: 'flex',
        flexDirection: 'column',
        width: '300px',
        background: 'rgba(9, 10, 11, 1)',
        margin: 0,
        padding: 0,
        overflow: 'auto',
    },
    emojiPickerContainer: {
        position: 'absolute',
        top: '-445px',
        left: '-75px',
    },
    reactionBackground: {
        position: 'absolute',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        top: -7,
        right: -12,
        background: 'rgba(37, 38, 42, 1)',
        borderRadius: '30px',
        width: '30px',
        height: '30px',
    },
    reactionContainer: {
        position: 'absolute',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        top: -5,
        right: -10,
        background: 'rgba(50, 50, 50, 1)',
        borderRadius: '30px',
        width: '25px',
        height: '25px',
        fontSize: '12px',
    },
    handRaisedContainer: {
        position: 'absolute',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        top: -5,
        right: -10,
        background: 'rgba(255, 255, 255, 1)',
        borderRadius: '30px',
        width: '25px',
        height: '25px',
        fontSize: '18px',
    },
};
