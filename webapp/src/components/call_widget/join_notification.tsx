import React, {useState} from 'react';
import {useIntl} from 'react-intl';
import MutedIcon from 'src/components/icons/muted_icon';
import UnmutedIcon from 'src/components/icons/unmuted_icon';

export type Props = {
    visible: boolean,
    isMuted: boolean,
}

export default function JoinNotification(props: Props) {
    const {formatMessage} = useIntl();
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

    const notificationContent = props.isMuted ? formatMessage({
        defaultMessage: 'You\'re muted. Select {muteIcon} to unmute.',
    }, {muteIcon}) : formatMessage({
        defaultMessage: 'You\'re unmuted. Select {muteIcon} to mute.',
    }, {muteIcon});

    return (
        <div
            className='calls-notification-bar calls-slide-top'
            data-testid={'calls-widget-on-join-notification'}
            onAnimationEnd={onAnimationEnd}
        >
            {notificationContent}
        </div>
    );
}
