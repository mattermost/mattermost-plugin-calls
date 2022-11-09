/* eslint-disable max-lines */
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {compareSemVer} from 'semver-parser';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import Picker from '@emoji-mart/react';

import {getEmojiImageUrl} from 'mattermost-redux/utils/emoji_utils';

import {UserProfile} from '@mattermost/types/users';
import {Team} from '@mattermost/types/teams';
import {Channel} from '@mattermost/types/channels';
import {Post} from '@mattermost/types/posts';

import styled, {createGlobalStyle, css, CSSObject} from 'styled-components';

import {ProductChannelsIcon} from '@mattermost/compass-icons/components';

import {RouteComponentProps} from 'react-router-dom';

import {getUserDisplayName, getScreenStream, isDMChannel, hasExperimentalFlag} from 'src/utils';
import {applyOnyx} from 'src/css_utils';

import {
    EmojiData,
    ReactionWithUser,
    UserState,
    AudioDevices,
    CallAlertStates,
    CallAlertStatesDefault,
} from 'src/types/types';
import {
    CallAlertConfigs,
} from 'src/constants';
import * as Telemetry from 'src/types/telemetry';

import {Emojis, EmojiIndicesByUnicode} from 'src/emojis/emoji';

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

import GlobalBanner from './global_banner';
import ControlsButton from './controls_button';

import './component.scss';

const EMOJI_VERSION = '13';

const EMOJI_SKINTONE_MAP = new Map([[1, ''], [2, '1F3FB'], [3, '1F3FC'], [4, '1F3FD'], [5, '1F3FE'], [6, '1F3FF']]);

interface Props extends RouteComponentProps {
    show: boolean,
    currentUserID: string,
    currentTeamID: string,
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
    selectRhsPost?: (postID: string) => void,
    prefetchThread: (postId: string) => void,
    closeRhs?: () => void,
    isRhsOpen?: boolean,
    screenSharingID: string,
    channel: Channel,
    channelTeam: Team,
    channelURL: string;
    channelDisplayName: string;

    connectedDMUser: UserProfile | undefined,
    threadID: Post['id'];
    threadUnreadReplies: number | undefined;
    threadUnreadMentions: number | undefined;
    rhsSelectedThreadID?: string;
    trackEvent: (event: Telemetry.Event, source: Telemetry.Source, props?: Record<string, any>) => void,
    allowScreenSharing: boolean,
}

interface State {
    screenStream: MediaStream | null,
    showParticipantsList: boolean,
    alerts: CallAlertStates,
    showEmojiPicker: boolean
}

export default class ExpandedView extends React.PureComponent<Props, State> {
    private screenPlayer = React.createRef<HTMLVideoElement>()
    private expandedRootRef = React.createRef<HTMLDivElement>()
    private pushToTalk = false;

    #unlockNavigation?: () => void;

    constructor(props: Props) {
        super(props);
        this.screenPlayer = React.createRef();
        this.state = {
            screenStream: null,
            showParticipantsList: false,
            alerts: CallAlertStatesDefault,
            showEmojiPicker: false,
        };

        if (window.opener) {
            const callsClient = window.opener.callsClient;
            callsClient.on('close', () => window.close());

            // don't allow navigation in expanded window e.g. permalinks in rhs
            this.#unlockNavigation = props.history.block(() => {
                return false;
            });
        } else if (window.desktop) {
            // TODO: remove this as soon as we support opening a window from desktop app.
            props.history.listen((_, action) => {
                if (action === 'REPLACE') {
                    // don't hide expanded view when location is replaced e.g. permalink/id is quietly removed after permalink nav occurred
                    return;
                }

                // navigation changed, hide expanded view e.g. a permalink was clicked in rhs
                this.props.hideExpandedView();
            });
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
        if (isActiveElementInteractable() && !this.expandedRootRef.current?.contains(document.activeElement)) {
            return;
        }

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

        if (isActiveElementInteractable() && !this.expandedRootRef.current?.contains(document.activeElement)) {
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

    setDevices = (devices: AudioDevices) => {
        this.setState({
            alerts: {
                ...this.state.alerts,
                missingAudioInput: {
                    ...this.state.alerts.missingAudioInput,
                    active: devices.inputs.length === 0,
                    show: devices.inputs.length === 0,
                },
            }});
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

    // TODO: can be outside component?
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
        if (!this.props.allowScreenSharing) {
            return;
        }
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
                const state = {} as State;
                const stream = await getScreenStream('', hasExperimentalFlag());
                if (window.opener && stream) {
                    window.screenSharingTrackId = stream.getVideoTracks()[0].id;
                }
                callsClient.setScreenStream(stream);
                state.screenStream = stream;

                if (stream) {
                    state.alerts = {
                        ...this.state.alerts,
                        missingScreenPermissions: {
                            ...this.state.alerts.missingScreenPermissions,
                            active: false,
                            show: false,
                        },
                    };
                } else {
                    state.alerts = {
                        ...this.state.alerts,
                        missingScreenPermissions: {
                            ...this.state.alerts.missingScreenPermissions,
                            active: true,
                            show: true,
                        },
                    };
                }

                this.setState(state);
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
            <div style={styles.emojiPickerContainer}>
                <Picker
                    emojiVersion={EMOJI_VERSION}
                    skinTonePosition='search'
                    onEmojiSelect={this.handleUserPicksEmoji}
                    onClickOutside={this.toggleEmojiPicker}
                    autoFocus={true}
                    perLine={12}
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

            if (this.props.selectRhsPost) {
                // global rhs supported

                if (this.props.threadID && !prevProps.threadID) {
                    // prefetch to get initial unreads
                    this.props.prefetchThread(this.props.threadID);
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
        callsClient.on('devicechange', this.setDevices);
        callsClient.on('initaudio', () => {
            this.setState({
                alerts: {
                    ...this.state.alerts,
                    missingAudioInputPermissions: {
                        active: false,
                        show: false,
                    },
                }});
        });

        this.setDevices(callsClient.getAudioDevices());

        const screenStream = callsClient.getLocalScreenStream() || callsClient.getRemoteScreenStream();

        // eslint-disable-next-line react/no-did-mount-set-state
        this.setState({
            alerts: {
                ...this.state.alerts,
                missingAudioInputPermissions: {
                    ...this.state.alerts.missingAudioInputPermissions,
                    active: !this.state.alerts.missingAudioInput.active && !callsClient.audioTrack,
                    show: !this.state.alerts.missingAudioInput.active && !callsClient.audioTrack,
                },
            },
            screenStream,
        });

        if (window.opener) {
            // core styling for rhs in expanded window
            document.body.classList.add('app__body');
            applyOnyx();

            if (this.props.selectRhsPost) {
                // global rhs supported

                if (this.props.threadID) {
                    // prefetch to get initial unreads
                    this.props.prefetchThread(this.props.threadID);
                }
            }
        }
    }

    toggleChat = async () => {
        if (this.props.isRhsOpen && this.props.rhsSelectedThreadID === this.props.threadID) {
            // close rhs
            this.props.closeRhs?.();
        } else if (this.props.channel.team_id && this.props.channel.team_id !== this.props.currentTeamID) {
            // go to call thread in channels
            this.props.history.push(`/${this.props.channelTeam.name}/pl/${this.props.threadID}`);
        } else if (this.props.threadID) {
            // open thread
            this.props.selectRhsPost?.(this.props.threadID);
        }
    }

    public componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKBShortcuts, true);
        window.removeEventListener('keyup', this.handleKeyUp, true);
        window.removeEventListener('blur', this.handleBlur, true);
        this.#unlockNavigation?.();
    }

    shouldRenderAlertBanner = () => {
        return Object.entries(this.state.alerts).filter((kv) => kv[1].show).length > 0;
    }

    renderAlertBanner = () => {
        for (const keyVal of Object.entries(this.state.alerts)) {
            const [alertID, alertState] = keyVal;
            if (!alertState.show) {
                continue;
            }

            const alertConfig = CallAlertConfigs[alertID];

            return (
                <GlobalBanner
                    {...alertConfig}
                    icon={alertConfig.icon}
                    body={alertConfig.bannerText}
                    onClose={() => {
                        this.setState({
                            alerts: {
                                ...this.state.alerts,
                                [alertID]: {
                                    ...alertState,
                                    show: false,
                                },
                            },
                        });
                    }}
                />
            );
        }

        return null;
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
            <div
                style={{
                    ...styles.screenContainer,

                    // Account for when we display an alert banner.
                    maxHeight: `calc(100% - ${this.shouldRenderAlertBanner() ? 240 : 200}px)`,
                }}
            >
                <ReactionStream style={{left: '0'}}/>
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
                            <div style={styles.reactionBackground}/>
                            <div style={styles.handRaisedContainer}>
                                {'🤚'}
                            </div>
                        </>
                        }
                        {!isHandRaised && hasReaction && status.reaction &&
                        <>
                            <div style={styles.reactionBackground}/>
                            <div style={styles.reactionContainer}>
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

        const noInputDevices = this.state.alerts.missingAudioInput.active;
        const noAudioPermissions = this.state.alerts.missingAudioInputPermissions.active;
        const noScreenPermissions = this.state.alerts.missingScreenPermissions.active;
        const isMuted = callsClient.isMuted();
        const MuteIcon = isMuted && !noInputDevices && !noAudioPermissions ? MutedIcon : UnmutedIcon;

        let muteTooltipText = isMuted ? 'Click to unmute' : 'Click to mute';
        let muteTooltipSubtext = '';
        if (noInputDevices) {
            muteTooltipText = CallAlertConfigs.missingAudioInput.tooltipText;
            muteTooltipSubtext = CallAlertConfigs.missingAudioInput.tooltipSubtext;
        }
        if (noAudioPermissions) {
            muteTooltipText = CallAlertConfigs.missingAudioInputPermissions.tooltipText;
            muteTooltipSubtext = CallAlertConfigs.missingAudioInputPermissions.tooltipSubtext;
        }

        const sharingID = this.props.screenSharingID;
        const currentID = this.props.currentUserID;
        const isSharing = sharingID === currentID;

        let shareScreenTooltipText = isSharing ? 'Stop presenting' : 'Start presenting';
        if (noScreenPermissions) {
            shareScreenTooltipText = CallAlertConfigs.missingScreenPermissions.tooltipText;
        }
        const shareScreenTooltipSubtext = noScreenPermissions ? CallAlertConfigs.missingScreenPermissions.tooltipSubtext : '';

        const isHandRaised = callsClient.isHandRaised;
        const HandIcon = isHandRaised ? UnraisedHandIcon : RaisedHandIcon;
        const raiseHandText = isHandRaised ? 'Lower hand' : 'Raise hand';
        const participantsText = 'Show participants list';

        let chatToolTipText = this.props.isRhsOpen && this.props.rhsSelectedThreadID === this.props.threadID ? 'Click to close chat' : 'Click to open chat';
        const chatToolTipSubtext = '';
        const chatDisabled = Boolean(this.props.channel?.team_id) && this.props.channel.team_id !== this.props.currentTeamID;
        if (chatDisabled) {
            chatToolTipText = `Chat unavailable: different team selected. Click here to switch back to ${this.props.channelDisplayName} in ${this.props.channelTeam.display_name}.`;
        }

        const globalRhsSupported = Boolean(this.props.selectRhsPost);

        const isChatUnread = Boolean(this.props.threadUnreadReplies);

        const handsup: string[] = [];

        // TODO: is this fixed?
        // building the list here causes a bug tht if a user leaves and recently reacted it will show as blank
        const profileMap: {[key: string]: UserProfile;} = {};
        this.props.profiles.forEach((profile) => {
            profileMap[profile.id] = profile;
            if (this.props.statuses[profile.id]?.raised_hand) {
                handsup.push(profile.id);
            }
        });

        return (
            <div
                ref={this.expandedRootRef}
                id='calls-expanded-view'
                style={globalRhsSupported ? styles.root : {
                    ...styles.root,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                }}
            >
                <div style={styles.main}>
                    { this.renderAlertBanner() }

                    {/*// TODO: removed from below, needed?:  alignItems: 'center',*/}
                    <div style={{display: 'flex', width: '100%'}}>
                        <div style={styles.topLeftContainer}>
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
                                style={styles.closeViewButton}
                                onClick={this.onCloseViewClick}
                            >
                                <CompassIcon icon='arrow-collapse'/>
                            </button>
                        }
                    </div>

                    { !this.props.screenSharingID &&
                        <div style={{flex: 1, display: 'flex', overflow: 'auto'}}>
                            <ReactionStream/>
                            <ul
                                id='calls-expanded-view-participants-grid'
                                style={{
                                    ...styles.participants,
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
                        style={styles.controls}
                    >
                        <div style={{flex: '1', display: 'flex', justifyContent: 'flex-start', marginLeft: '16px'}}>
                            <ControlsButton
                                id='calls-popout-participants-button'
                                onToggle={() => this.onParticipantsListToggle()}
                                tooltipText={this.state.showParticipantsList ? 'Hide participants list' : 'Show participants list'}
                                shortcut={reverseKeyMappings.popout[PARTICIPANTS_LIST_TOGGLE][0]}
                                bgColor={this.state.showParticipantsList ? 'rgba(28, 88, 217, 0.32)' : ''}
                                icon={
                                    <ParticipantsIcon
                                        style={{width: '28px', height: '28px', fill: this.state.showParticipantsList ? 'rgb(28, 88, 217)' : 'white'}}
                                    />
                                }
                                margin='0'
                            />
                        </div>

                        <div style={styles.centerControls}>
                            <ControlsButton
                                id='calls-popout-raisehand-button'
                                onToggle={() => this.onRaiseHandToggle()}
                                tooltipText={raiseHandText}
                                shortcut={reverseKeyMappings.popout[RAISE_LOWER_HAND][0]}
                                bgColor={isHandRaised ? 'rgba(255, 188, 66, 0.16)' : ''}
                                icon={
                                    <HandIcon
                                        style={{width: '28px', height: '28px', fill: isHandRaised ? 'rgba(255, 188, 66, 1)' : 'white'}}
                                    />
                                }
                            />

                            {/*// TODO: make the below a ControlsButton component*/}
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

                            { this.props.allowScreenSharing &&
                            <ControlsButton
                                id='calls-popout-screenshare-button'
                                onToggle={() => this.onShareScreenToggle()}
                                tooltipText={shareScreenTooltipText}
                                tooltipSubtext={shareScreenTooltipSubtext}
                                // eslint-disable-next-line no-undefined
                                shortcut={noScreenPermissions ? undefined : reverseKeyMappings.popout[SHARE_UNSHARE_SCREEN][0]}
                                bgColor={isSharing ? 'rgba(var(--dnd-indicator-rgb), 0.12)' : ''}
                                icon={
                                    <ScreenIcon
                                        style={{width: '28px', height: '28px', fill: isSharing ? 'rgb(var(--dnd-indicator-rgb))' : ''}}
                                    />
                                }
                                unavailable={noScreenPermissions}
                                disabled={sharingID !== '' && !isSharing}
                            />
                            }

                            <ControlsButton
                                id='calls-popout-mute-button'
                                // eslint-disable-next-line no-undefined
                                onToggle={noInputDevices ? undefined : this.onMuteToggle}
                                tooltipText={muteTooltipText}
                                tooltipSubtext={muteTooltipSubtext}
                                // eslint-disable-next-line no-undefined
                                shortcut={noInputDevices || noAudioPermissions ? undefined : reverseKeyMappings.popout[MUTE_UNMUTE][0]}
                                bgColor={isMuted ? '' : 'rgba(61, 184, 135, 0.16)'}
                                icon={
                                    <MuteIcon
                                        style={{width: '28px', height: '28px', fill: isMuted ? '' : 'rgba(61, 184, 135, 1)'}}
                                    />
                                }
                                unavailable={noInputDevices || noAudioPermissions}
                            />
                            {globalRhsSupported && (
                                <ControlsButton
                                    id='calls-popout-chat-button'
                                    onToggle={this.toggleChat}
                                    tooltipText={chatToolTipText}
                                    tooltipSubtext={chatToolTipSubtext}
                                    // eslint-disable-next-line no-undefined
                                    shortcut={undefined}
                                    bgColor={''}
                                    icon={
                                        <div css={{position: 'relative'}}>
                                            <ProductChannelsIcon // TODO use 'icon-message-text-outline' once added
                                                size={28}
                                                color={'white'}
                                            />
                                            {!chatDisabled && isChatUnread && (
                                                <UnreadIndicator mentions={this.props.threadUnreadMentions}/>
                                            )}
                                        </div>
                                    }
                                    unavailable={chatDisabled}
                                />
                            )}
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
                <ul style={styles.rhs}>
                    <span style={{position: 'sticky', top: '0', background: 'inherit', fontWeight: 600, padding: '8px'}}>{'Participants list'}</span>
                    { this.renderParticipantsRHSList() }
                </ul>
                }
                {globalRhsSupported && <ExpandedViewGlobalsStyle callThreadSelected={this.props.rhsSelectedThreadID === this.props.threadID}/>}
            </div>
        );
    }
}

const isActiveElementInteractable = () => {
    return document.activeElement && ['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(document.activeElement.tagName);
};

const UnreadIndicator = ({mentions}: {mentions?: number}) => {
    return (
        <UnreadDot>{mentions && mentions > 99 ? '99+' : mentions || null}</UnreadDot>
    );
};

const UnreadDot = styled.span`
    position: absolute;
    z-index: 1;
    top: 0px;
    right: -1px;
    width: 8px;
    height: 8px;
    background: var(--mention-bg);
    border-radius: 9px;
    box-shadow: 0 0 0 2px rgb(37 38 42);
    color: white;
    &:not(:empty) {
        top: -7px;
        right: -8px;
        width: auto;
        min-width: 20px;
        height: auto;
        padding: 0 6px;
        border-radius: 8px;
        font-size: 11px;
        -webkit-font-smoothing: subpixel-antialiased;
        -moz-osx-font-smoothing: grayscale;
        font-weight: 700;
        letter-spacing: 0;
        line-height: 16px;
        text-align: center;
    }
`;

const styles: Record<string, CSSObject> = {
    root: {
        display: 'flex',
        width: '100%',
        height: '100%',
        zIndex: 1000,
        background: 'rgba(37, 38, 42, 1)',
        color: 'white',
        gridArea: 'center',
        overflow: 'auto',
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
    centerControls: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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

const ExpandedViewGlobalsStyle = createGlobalStyle<{callThreadSelected: boolean}>`
    #root {
        > #global-header,
        > .team-sidebar,
        > .app-bar,
        > #channel_view .channel__wrap,
        > #SidebarContainer {
            display: none;
        }
        #sidebar-right #sbrSearchFormContainer {
            // mobile search not supported in expanded view or expanded window
            // TODO move to hideMobileSearchBarInRHS prop of Search component in mattermost-webapp
            display: none;
        }
        .channel-view-inner {
            padding: 0;
        }
        ${({callThreadSelected}) => !callThreadSelected && css`
            .sidebar--right {
                display: none;
            }
        `}
    }
    #sidebar-right {
        z-index: 1001;
    }
`;
