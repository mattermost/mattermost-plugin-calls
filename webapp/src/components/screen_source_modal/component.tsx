import React, {CSSProperties} from 'react';

import {Channel} from '@mattermost/types/channels';
import {changeOpacity} from 'mattermost-redux/utils/theme_utils';
import {Theme} from 'mattermost-redux/types/themes';

import {CapturerSource} from '@calls/common';

import {hasExperimentalFlag, sendDesktopEvent, shouldRenderDesktopWidget} from 'src/utils';
import CompassIcon from 'src/components/icons/compassIcon';

import './component.scss';

interface Props {
    theme: Theme,
    connectedChannel: Channel,
    show: boolean,
    hideScreenSourceModal: () => void,
}

interface State {
    sources: CapturerSource[],
    selected: string,
}

export default class ScreenSourceModal extends React.PureComponent<Props, State> {
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
            maxWidth: '832px',
            maxHeight: '614px',
        },
        header: {
            position: 'relative',
            width: '100%',
            padding: '26px 32px',
        },
        title: {
            fontWeight: 600,
            fontFamily: 'Metropolis',
            fontSize: '22px',
            lineHeight: '28px',
        },
        body: {
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            overflow: 'auto',
            padding: '28px 32px',
        },
        footer: {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            alignSelf: 'flex-end',
            padding: '24px 32px',
        },
        source: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            margin: '8px 4px',
        },
        sourceLabel: {
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            width: '224px',
        },
        divider: {
            border: `1px solid ${changeOpacity(this.props.theme.centerChannelColor, 0.08)}`,
            width: '100%',
            margin: 0,
        },
    };

    constructor(props: Props) {
        super(props);
        this.node = React.createRef();
        this.state = {
            sources: [],
            selected: '',
        };
    }

    private keyboardClose = (e: KeyboardEvent) => {
        if (this.props.show && e.key === 'Escape') {
            this.hide();
        }
    };

    private closeOnBlur = (e: Event) => {
        if (!this.props.show) {
            return;
        }
        if (this.node?.current && e.target && this.node.current.contains(e.target as Node)) {
            return;
        }
        this.hide();
    };

    private renderSources = () => {
        return this.state.sources.map((source) => {
            return (
                <button
                    className='style--none'
                    style={this.style.source as CSSProperties}
                    key={source.id}
                    onClick={() => this.setState({selected: source.id})}
                >
                    <div className={`screen-source-thumbnail ${source.id === this.state.selected ? 'selected' : ''}`}>
                        <img
                            style={{
                                height: '100%',
                            }}
                            src={source.thumbnailURL}
                        />
                    </div>
                    <span style={this.style.sourceLabel as CSSProperties}>{source.name}</span>
                </button>
            );
        });
    };

    private hide = () => {
        this.setState({
            sources: [],
            selected: '',
        });
        this.props.hideScreenSourceModal();
    };

    private shareScreen = () => {
        if (shouldRenderDesktopWidget()) {
            sendDesktopEvent('calls-widget-share-screen', {
                sourceID: this.state.selected,
                withAudio: hasExperimentalFlag(),
            });
        } else {
            window.callsClient?.shareScreen(this.state.selected, hasExperimentalFlag());
        }
        this.hide();
    };

    componentDidMount() {
        document.addEventListener('keyup', this.keyboardClose, true);
        document.addEventListener('click', this.closeOnBlur, true);

        window.addEventListener('message', this.handleDesktopCapturerMessage);
    }

    componentWillUnmount() {
        document.removeEventListener('keyup', this.keyboardClose, true);
        document.removeEventListener('click', this.closeOnBlur, true);

        window.removeEventListener('message', this.handleDesktopCapturerMessage);
    }

    componentDidUpdate(prevProps: Props) {
        if (!prevProps.show && this.props.show) {
            // Send a message to the desktop app to get the sources needed
            sendDesktopEvent('get-desktop-sources', {
                types: ['window', 'screen'],
                thumbnailSize: {
                    width: 400,
                    height: 400,
                },
            });
        }
    }

    handleDesktopCapturerMessage = (event: MessageEvent) => {
        if (event.data.type !== 'desktop-sources-result') {
            return;
        }

        const sources = event.data.message;
        this.setState({
            sources,
            selected: sources[0]?.id || '',
        });
    };

    render() {
        if (!this.props.show || this.state.sources.length === 0) {
            return null;
        }
        return (
            <div style={this.style.main as CSSProperties}>
                <div
                    id='calls-screen-source-modal'
                    style={this.style.modal as CSSProperties}
                    ref={this.node}
                >
                    <div style={this.style.header as CSSProperties}>
                        <span style={this.style.title}>
                            {'Choose what to share'}
                        </span>
                        <button
                            className='style--none screen-source-modal-close'
                            onClick={this.hide}
                        >
                            <CompassIcon icon='close'/>
                        </button>
                    </div>
                    <hr style={this.style.divider}/>
                    <div style={this.style.body as CSSProperties}>
                        { this.renderSources() }
                    </div>
                    <hr style={this.style.divider}/>
                    <div style={this.style.footer}>
                        <button
                            className='style--none screen-source-modal-cancel'
                            onClick={this.hide}
                        >{'Cancel'}</button>
                        <button
                            className='style--none screen-source-modal-join'
                            onClick={this.shareScreen}
                        >{'Share'}</button>
                    </div>
                </div>
            </div>
        );
    }
}
