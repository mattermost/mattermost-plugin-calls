import React from 'react';
import styled, {css} from 'styled-components';

import CompassIcon from 'src/components/icons/compassIcon';

import MutedIcon from '../../components/icons/muted_icon';
import UnmutedIcon from '../../components/icons/unmuted_icon';
import Avatar from '../avatar/avatar';

export type Props = {
    name: string,
    pictureURL?: string,
    isMuted: boolean,
    isHandRaised: boolean,
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
                        background: 'rgba(50, 50, 50, 1)',
                        borderRadius: '30px',
                        width: '20px',
                        height: '20px',
                    }}
                >
                    <MuteIcon
                        fill={props.isMuted ? '#C4C4C4' : '#3DB887'}
                        style={{width: '14px', height: '14px'}}
                        stroke={props.isMuted ? '#C4C4C4' : ''}
                    />
                </div>
                <div
                    style={{
                        position: 'absolute',
                        display: props.isHandRaised ? 'flex' : 'none',
                        justifyContent: 'center',
                        alignItems: 'center',
                        top: 0,
                        right: 0,
                        background: 'rgba(50, 50, 50, 1)',
                        borderRadius: '30px',
                        width: '20px',
                        height: '20px',
                        fontSize: '12px',
                    }}
                >
                    {'✋'}
                </div>
            </div>

            <span style={{fontWeight: 600, fontSize: '12px', margin: '8px 0'}}>
                {props.name}
            </span>

            { props.isHost &&
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
