import React, {useState} from 'react';
import {useIntl} from 'react-intl';
import styled, {css} from 'styled-components';

export type Props = {
    visible: boolean,
}

export default function LoadingOverlay(props: Props) {
    const {formatMessage} = useIntl();
    const [animationEnded, setAnimationEnded] = useState(false);

    if (!props.visible && animationEnded) {
        return null;
    }

    const onAnimationEnd = () => {
        setAnimationEnded(true);
    };

    return (
        <Container
            data-testid={'calls-widget-loading-overlay'}
            onAnimationEnd={onAnimationEnd}
            $visible={props.visible}
        >
            <Body>
                <Spinner $size={16}/>
                <Text>{formatMessage({defaultMessage: 'Connecting to the call…'})}</Text>
            </Body>
        </Container>
    );
}

const Container = styled.div<{$visible: boolean}>`
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  border-radius: 4px;
  z-index: 1;
  background: rgba(var(--center-channel-bg-rgb), 0.7);
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
`;

const Text = styled.span`
  color: rgba(var(--center-channel-color-rgb), 0.84);
  font-size: 12px;
  line-height: 16px;
  margin-left: 8px;
  font-weight: 600;
`;

const Spinner = styled.span<{$size: number}>`
  width: ${({$size}) => $size}px;
  height: ${({$size}) => $size}px;
  border-radius: 50%;
  display: inline-block;
  border-top: 2px solid #166DE0;
  border-right: 2px solid transparent;
  box-sizing: border-box;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
`;
