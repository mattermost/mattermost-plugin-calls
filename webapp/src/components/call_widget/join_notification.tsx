import React, {useState} from 'react';
import {FormattedMessage} from 'react-intl';
import MutedIcon from 'src/components/icons/muted_icon';
import UnmutedIcon from 'src/components/icons/unmuted_icon';

export type Props = {
    visible: boolean,
    isMuted: boolean,
}

export default function JoinNotification(props: Props) {
    const [animationEnded, setAnimationEnded] = useState(false);

    if (!props.visible || animationEnded) {
        return null;
    }

    const onAnimationEnd = () => {
        setAnimationEnded(true);
    };

    const MuteIcon = props.isMuted ? MutedIcon : UnmutedIcon;

    const muteIcon = (
        <MuteIcon
            style={{
                width: '11px',
                height: '11px',
                fill: props.isMuted ? 'var(--center-channel-color)' : '#3DB887',
            }}
        />
    );

    const muted = (
        <FormattedMessage
            defaultMessage={'<b>You\'re muted.</b> Select {muteIcon} to unmute.'}
            values={{
                b: (text: string) => <b>{text}</b>,
                muteIcon,
            }}
        />);
    const unmuted = (
        <FormattedMessage
            defaultMessage={'<b>You\'re unmuted.</b> Select {muteIcon} to mute.'}
            values={{
                b: (text: string) => <b>{text}</b>,
                muteIcon,
            }}
        />);

    return (
        <div
            className='calls-notification-bar calls-slide-top'
            data-testid={'calls-widget-on-join-notification'}
            onAnimationEnd={onAnimationEnd}
        >
            <span style={{marginLeft: 4}}>
                {props.isMuted ? muted : unmuted}
            </span>
        </div>
    );
}
