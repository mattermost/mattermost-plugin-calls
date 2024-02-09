import './component.scss';

import {DesktopCaptureSource} from '@mattermost/desktop-api';
import React, {CSSProperties} from 'react';
import {IntlShape} from 'react-intl';
import CompassIcon from 'src/components/icons/compassIcon';
import {logDebug, logErr} from 'src/log';
import {hasExperimentalFlag, sendDesktopEvent, shouldRenderDesktopWidget} from 'src/utils';

interface Props {
    intl: IntlShape,
    show: boolean,
    hideScreenSourceModal: () => void,
}

interface State {
    sources: DesktopCaptureSource[],
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
            border: '1px solid rgba(var(--center-channel-color-rgb), 0.08)',
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
        if (window.desktopAPI?.shareScreen) {
            logDebug('desktopAPI.shareScreen');
            window.desktopAPI.shareScreen(this.state.selected, hasExperimentalFlag());
        } else if (shouldRenderDesktopWidget()) {
            // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
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

        if (!window.desktopAPI?.getDesktopSources) {
            // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
            window.addEventListener('message', this.handleDesktopEvents);
        }
    }

    componentWillUnmount() {
        document.removeEventListener('keyup', this.keyboardClose, true);
        document.removeEventListener('click', this.closeOnBlur, true);

        if (!window.desktopAPI?.getDesktopSources) {
            // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
            window.removeEventListener('message', this.handleDesktopEvents);
        }
    }

    componentDidUpdate(prevProps: Props) {
        if (!prevProps.show && this.props.show) {
            const payload = {
                types: ['window', 'screen'] as Array<'screen' | 'window'>,
                thumbnailSize: {
                    width: 400,
                    height: 400,
                },
            };

            if (window.desktopAPI?.getDesktopSources) {
                logDebug('desktopAPI.getDesktopSources');
                window.desktopAPI.getDesktopSources(payload).then((sources) => {
                    if (sources.length === 0) {
                        logErr('desktopAPI.getDesktopSources returned empty');
                        this.props.hideScreenSourceModal();
                        return;
                    }
                    this.setState({
                        sources,
                        selected: sources[0]?.id || '',
                    });
                }).catch((err) => {
                    logErr('desktopAPI.getDesktopSources failed', err);
                    this.props.hideScreenSourceModal();
                });
            } else {
                // Send a message to the desktop app to get the sources needed
                // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
                sendDesktopEvent('get-desktop-sources', payload);
            }
        }
    }

    // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
    handleDesktopEvents = (ev: MessageEvent) => {
        if (ev.origin !== window.origin) {
            return;
        }

        if (ev.data.type === 'desktop-sources-result') {
            const sources = ev.data.message;
            this.setState({
                sources,
                selected: sources[0]?.id || '',
            });
        } else if (ev.data.type === 'calls-error' && ev.data.message.err === 'screen-permissions') {
            this.props.hideScreenSourceModal();
        }
    };

    render() {
        const {formatMessage} = this.props.intl;

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
                            {formatMessage({defaultMessage: 'Choose what to share'})}
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
                        >{formatMessage({defaultMessage: 'Cancel'})}</button>
                        <button
                            className='style--none screen-source-modal-join'
                            onClick={this.shareScreen}
                        >{formatMessage({defaultMessage: 'Share'})}</button>
                    </div>
                </div>
            </div>
        );
    }
}
