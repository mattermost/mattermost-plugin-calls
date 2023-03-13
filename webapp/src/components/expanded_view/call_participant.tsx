import React from 'react';

import {CSSObject} from 'styled-components';

import CompassIcon from 'src/components/icons/compassIcon';
import MutedIcon from 'src/components/icons/muted_icon';
import UnmutedIcon from 'src/components/icons/unmuted_icon';
import RaisedHandIcon from 'src/components/icons/raised_hand';
import Avatar from 'src/components/avatar/avatar';
import {Reaction} from 'src/types/types';
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
                    borderGlow={props.isSpeaking}
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
                        background: props.isMuted ? 'var(--calls-bg)' : '#3DB887',
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
                    <RaisedHandIcon
                        style={{
                            fill: 'rgb(255, 188, 66)',
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
                    {'Host'}
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
        color: 'rgba(255, 188, 66, 1)',
        borderRadius: '30px',
        width: '25px',
        height: '25px',
        fontSize: '18px',
    },
};
