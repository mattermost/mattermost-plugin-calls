import React from 'react';
import styled from 'styled-components';

import CompassIcon from 'src/components/icons/compassIcon';

export type Props = {
    testId: string,
    icon: string | React.ReactNode,
    iconFill?: string,
    iconColor?: string,
    body: string,
    error?: string,
    header: string,
    confirmText?: string,
    declineText?: string,
    onClose?: () => void,
    onDecline?: () => void,
}

export default function InCallPrompt(props: Props) {
    return (
        <Prompt data-testid={props.testId}>
            <Icon
                fill={props.iconFill}
                color={props.iconColor}
            >
                { typeof props.icon === 'string' &&
                <CompassIcon icon={props.icon}/>
                }

                { typeof props.icon !== 'string' &&
                  props.icon
                }
            </Icon>

            <Main>
                <Header>
                    {props.header}
                </Header>
                <Body>
                    {props.body}
                    { props.error &&
                    <ErrorMsg>{props.error}</ErrorMsg>
                    }
                </Body>
                <Footer>
                    { props.confirmText && props.onClose &&
                        <ConfirmButton
                            className='cursor--pointer style--none'
                            onClick={props.onClose}
                        >
                            {props.confirmText}
                        </ConfirmButton>
                    }

                    { props.declineText && props.onDecline &&
                        <DeclineButton
                            className='cursor--pointer style--none'
                            onClick={props.onDecline}
                        >
                            {props.declineText}
                        </DeclineButton>
                    }
                </Footer>
            </Main>

            { props.onClose &&
                <CloseButton
                    onClick={props.onClose}
                    data-testid={'popout-prompt-close'}
                >
                    <CompassIcon icon='close'/>
                </CloseButton>
            }
        </Prompt>
    );
}

const Prompt = styled.div`
  display: flex;
  margin: 0 24px;
  background: var(--center-channel-bg);
  border: 1px solid rgba(var(--center-channel-color-rgb), 0.16);
  color: var(--center-channel-color);
  box-shadow: 0px 8px 24px rgba(0, 0, 0, 0.12);
  border-radius: 4px;
  padding: 24px 22px;
  max-width: 480px;
`;

const Main = styled.div`
  display: flex;
  flex-direction: column;
  padding-left: 10px;
  padding-right: 5px;
`;

const Header = styled.div`
  font-weight: 700;
  line-height: 18px;
`;

const Body = styled.div`
  margin-top: 8px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
`;

const Footer = styled.div`
`;

const ConfirmButton = styled.button`
  &&& {
  color: var(--button-color);
  background: var(--button-bg);
  font-weight: 600;
  padding: 10px 16px;
  border-radius: 4px;
  margin-right: 6px;
  }

  &&&:hover {
    background: rgba(var(--button-bg-rgb), 0.9);
  }
`;

const DeclineButton = styled.button`
  &&& {
  color: var(--dnd-indicator);
  background: rgba(var(--dnd-indicator-rgb), 0.08);
  font-weight: 600;
  padding: 10px 16px;
  border-radius: 4px;
  margin-left: 6px;
  }

  &&&:hover {
    background: rgba(var(--dnd-indicator-rgb), 0.04);
  }
`;

const Icon = styled.div<{fill?: string, color?: string}>`
  font-size: 18px;
  fill: ${({fill}) => (fill || 'currentColor')};
  color: ${({color}) => (color || 'currentColor')};
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(var(--center-channel-color-rgb), 0.56);
  width: 32px;
  height: 32px;
  border-radius: 4px;
  border: none;
  background: transparent;

  i {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    line-heght: 18px;
  }

  :hover {
    background: rgba(var(--center-channel-color-rgb), 0.08);
    color: rgba(var(--center-channel-color-rgb), 0.72);
    fill: rgba(var(--center-channel-color-rgb), 0.72);
  }
`;

const ErrorMsg = styled.i`
  color: rgba(var(--center-channel-color-rgb), 0.72);
  margin-top: 8px;
`;
