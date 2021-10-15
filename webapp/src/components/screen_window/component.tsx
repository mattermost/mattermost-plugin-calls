import React, {CSSProperties} from 'react';

import MutedIcon from '../../components/icons/muted_icon';
import UnmutedIcon from '../../components/icons/unmuted_icon';

interface Props {
    currentUserID: string,
}

interface State {
    isMuted: boolean,
}

export default class CallWidget extends React.PureComponent<Props, State> {
    private screenPlayer = React.createRef<HTMLVideoElement>()

    constructor(props: Props) {
        super(props);
        this.screenPlayer = React.createRef();
        this.state = {
            isMuted: true,
        };
    }

    public componentDidMount() {
        // removing global header
        const header = document.getElementsByTagName('header');
        if (header && header[0]) {
            header[0].remove();
        }

        if (!window.opener) {
            return;
        }

        const player = window.opener.document.getElementById('screen-player');
        if (this.screenPlayer && this.screenPlayer.current && player) {
            this.screenPlayer.current.srcObject = player.srcObject;
        }

        window.addEventListener('message', (ev) => {
            if (ev.origin === window.opener.origin) {
                this.setState(ev.data);
            }
        }, false);
    }

    onMuteToggle = () => {
        let isMuted: boolean;
        if (this.state.isMuted) {
            window.opener.callsClient.unmute();
            isMuted = false;
            this.setState({isMuted});
        } else {
            window.opener.callsClient.mute();
            isMuted = true;
            this.setState({isMuted});
        }
        window.opener.postMessage({isMuted}, window.location.origin);
    }

    render() {
        if (!window.opener) {
            return null;
        }

        const MuteIcon = this.state.isMuted ? MutedIcon : UnmutedIcon;

        return (
            <div style={style.main as CSSProperties}>
                <div style={style.player}>
                    <video
                        id='screen-player'
                        ref={this.screenPlayer}
                        width='100%'
                        height='100%'
                        muted={true}
                        autoPlay={true}
                    />
                </div>
                <div style={style.controls}>
                    <button
                        className='cursor--pointer style--none button-controls'
                        style={this.state.isMuted ? style.mutedButton : style.unmutedButton}
                        onClick={this.onMuteToggle}
                    >
                        <MuteIcon
                            style={{width: '24px', height: '24px'}}
                        />
                    </button>
                </div>
            </div>
        );
    }
}

const style = {
    main: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100vh',
        background: 'black',
    },
    player: {
        height: 'calc(100% - 80px)',
    },
    controls: {
        display: 'flex',
        height: '80px',
        width: '100%',
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    mutedButton: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '44px',
        height: '44px',
        marginRight: '16px',
        background: 'white',
    },
    unmutedButton: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '44px',
        height: '44px',
        background: '#3DB887',
        borderRadius: '4px',
        color: 'white',
        marginRight: '16px',
    },
};
