// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {Spinner} from 'src/components/shared';
import styled, {css} from 'styled-components';

export type JoinLoadingOverlayProps = {
    visible: boolean,
    joining: boolean,
}

export function JoinLoadingOverlay({visible, joining}: JoinLoadingOverlayProps) {
    const {formatMessage} = useIntl();
    const [transitionEnded, setTransitionEnded] = useState(false);
    const wasJoining = useMemo(() => {
        return joining;
    }, [/* intentionally empty */]);

    if (!visible && transitionEnded) {
        return null;
    }

    const onTransitionEnd = () => {
        setTransitionEnded(true);
    };

    const text = wasJoining ? formatMessage({defaultMessage: 'Joining call…'}) : formatMessage({defaultMessage: 'Starting call…'});

    return (
        <Container
            data-testid={'calls-widget-loading-overlay'}
            onTransitionEnd={onTransitionEnd}
            $visible={visible}
            $background='rgba(var(--center-channel-bg-rgb), 0.7)'
        >
            <Body>
                <Spinner $size={16}/>
                <Text $size={12}>{text}</Text>
            </Body>
        </Container>
    );
}

const Container = styled.div<{$visible: boolean, $background?: string}>`
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  border-radius: 4px;
  z-index: 1;

  ${({$background}) => $background && css`
    background: ${$background};
  `}

  app-region: drag;

  ${({$visible}) => !$visible && css`
      visibility: hidden;
      opacity: 0;
      transition: visibility 0s 0.3s, opacity 0.3s ease-out;
  `}
`;

const Body = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
`;

const Text = styled.span<{$size: number}>`
  color: var(--center-channel-color);
  font-size: ${({$size}) => $size}px;
  line-height: 16px;
  font-weight: 600;
`;

export type LoadingOverlayProps = {
    visible: boolean,
    spinnerSize?: number,
    text?: string | React.ReactNode[],
    textSize?: number,
}

export function VideoLoadingOverlay({visible, spinnerSize = 16, text, textSize = 12}: LoadingOverlayProps) {
    const [transitionEnded, setTransitionEnded] = useState(false);

    if (!visible && transitionEnded) {
        return null;
    }

    const onTransitionEnd = () => {
        setTransitionEnded(true);
    };

    return (
        <Container
            data-testid={'calls-video-loading-overlay'}
            onTransitionEnd={onTransitionEnd}
            $visible={visible}
        >
            <Body>
                <Spinner $size={spinnerSize}/>
                {text && <Text $size={textSize}>{text}</Text>}
            </Body>
        </Container>
    );
}
