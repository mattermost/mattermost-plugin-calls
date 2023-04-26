import React from 'react';
import {useIntl} from 'react-intl';

import {CSSObject} from 'styled-components';

import {Reaction} from '@calls/common/lib/types';

import MutedIcon from 'src/components/icons/muted_icon';
import UnmutedIcon from 'src/components/icons/unmuted_icon';
import HandEmoji from 'src/components/icons/hand';
import Avatar from 'src/components/avatar/avatar';
import {Emoji} from 'src/components/emoji/emoji';

export type Props = {
    name: string,
    pictureURL?: string,
    isMuted: boolean,
    isHandRaised: boolean,
    reaction?: Reaction,
    isSpeaking: boolean,
    isHost: boolean,
}

export default function CallParticipant(props: Props) {
    const {formatMessage} = useIntl();
    const MuteIcon = props.isMuted ? MutedIcon : UnmutedIcon;

    if (!props.pictureURL) {
        return null;
    }

    return (
        <li
            style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'center',
                margin: '16px',
                gap: '12px',
            }}
        >

            <div style={{position: 'relative'}}>
                <Avatar
                    size={50}
                    fontSize={18}
                    border={false}
                    borderGlowWidth={props.isSpeaking ? 3 : 0}
                    url={props.pictureURL}
                />
                <div
                    style={{
                        position: 'absolute',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        bottom: 0,
                        right: 0,
                        background: props.isMuted ? 'var(--calls-badge-bg)' : '#3DB887',
                        borderRadius: '30px',
                        width: '20px',
                        height: '20px',
                    }}
                >
                    <MuteIcon
                        fill='white'
                        style={{width: '14px', height: '14px'}}
                    />
                </div>
                {props.isHandRaised &&
                <div style={styles.handRaisedContainer}>
                    <HandEmoji
                        style={{
                            fill: 'var(--away-indicator)',
                            width: '20px',
                            height: '20px',
                        }}
                    />
                </div>
                }
                {!props.isHandRaised && props.reaction &&
                    <div style={{...styles.reactionContainer, background: 'var(--calls-bg)'}}>
                        <Emoji emoji={props.reaction.emoji}/>
                    </div>
                }
            </div>

            <span style={{fontWeight: 600, fontSize: '12px', lineHeight: '16px', textAlign: 'center'}}>
                {props.name}
            </span>

            {props.isHost &&
                <span
                    style={{
                        fontWeight: 600,
                        padding: '0 4px',
                        textTransform: 'uppercase',
                        background: 'rgba(255, 255, 255, 0.08)',
                        borderRadius: '4px',
                        fontSize: '10px',
                        lineHeight: '16px',
                    }}
                >
                    {formatMessage({defaultMessage: 'Host'})}
                </span>
            }
        </li>
    );
}

const styles: Record<string, CSSObject> = {
    reactionContainer: {
        position: 'absolute',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        top: -5,
        right: -10,
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
        background: 'white',
        color: 'var(--away-indicator)',
        borderRadius: '30px',
        width: '25px',
        height: '25px',
        fontSize: '18px',
    },
};
