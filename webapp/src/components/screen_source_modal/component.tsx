import React, {CSSProperties} from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';

import {Channel} from 'mattermost-redux/types/channels';

import {changeOpacity} from 'mattermost-redux/utils/theme_utils';

import CompassIcon from '../../components/icons/compassIcon';

import './component.scss';

interface Props {
    theme: any,
    connectedChannel: Channel,
    show: boolean,
    hideScreenSourceModal: () => void,
}

interface State {
    sources: any[],
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
            borderRadius: '12px',
            border: `1px solid ${changeOpacity(this.props.theme.centerChannelColor, 0.16)}`,
            boxShadow: `0px 20px 32px ${changeOpacity(this.props.theme.centerChannelColor, 0.12)}`,
            padding: '40px',
            maxWidth: '80%',
        },
        header: {
            fontWeight: 600,
            fontSize: '18px',
            marginBottom: '8px',
        },
        body: {
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
        },
        footer: {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginTop: '32px',
            alignSelf: 'flex-end',
        },
        source: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            margin: '4px',
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
        if (e.key === 'Escape') {
            this.hide();
        }
    }

    private closeOnBlur = (e: Event) => {
        if (this.node?.current && e.target && this.node.current.contains(e.target as Node)) {
            return;
        }
        this.hide();
    }

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
                            style={{maxHeight: '225px'}}
                            src={source.thumbnailURL}
                        />
                    </div>
                    <span>{source.name}</span>
                </button>
            );
        });
    }

    private hide = () => {
        this.setState({
            sources: [],
            selected: '',
        });
        this.props.hideScreenSourceModal();
    }

    private shareScreen = () => {
        window.callsClient.shareScreen(this.state.selected);
        this.hide();
    }

    componentDidMount() {
        document.addEventListener('keyup', this.keyboardClose, true);
        document.addEventListener('click', this.closeOnBlur, true);
    }

    componentWillUnmount() {
        document.removeEventListener('keyup', this.keyboardClose, true);
        document.removeEventListener('click', this.closeOnBlur, true);
    }

    async componentDidUpdate(prevProps: Props) {
        if (!prevProps.show && this.props.show) {
            const sources = await window.desktopCapturer.getSources({
                types: ['window', 'screen'],
                thumbnailSize: {
                    width: 400,
                    height: 400,
                },
            });
            // eslint-disable-next-line react/no-did-update-set-state
            this.setState({sources});
        }
    }

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
                    <button
                        className='style--none screen-source-modal-close'
                        onClick={this.hide}
                    >
                        <CompassIcon icon='close'/>
                    </button>
                    <div style={this.style.header}>
                        {'Choose what to share'}
                    </div>
                    <div style={this.style.body as CSSProperties}>
                        { this.renderSources() }
                    </div>
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
