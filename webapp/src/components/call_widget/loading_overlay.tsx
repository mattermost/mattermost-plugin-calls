import React, {useState} from 'react';
import {useIntl} from 'react-intl';
import {Spinner} from 'src/components/shared';
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
                <Text>{formatMessage({defaultMessage: 'Joining call…'})}</Text>
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
  gap: 6px;
`;

const Text = styled.span`
  color: var(--center-channel-color);
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
`;
