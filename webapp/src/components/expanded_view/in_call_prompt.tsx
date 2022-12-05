import React from 'react';
import styled, {css} from 'styled-components';

import CompassIcon from 'src/components/icons/compassIcon';

export type Props = {
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
        <Prompt>
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
            <span>
                <CloseButton onClick={props.onClose}>
                    <CompassIcon icon='close'/>
                </CloseButton>
            </span>
            }
        </Prompt>
    );
}

const Prompt = styled.div`
  display: flex;
  position: absolute;
  bottom: 100px;
  margin: 0 24px;
  background: rgba(221, 223, 228, 0.08);
  border: 1px solid rgba(61, 60, 64, 0.16);
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
  font-weight: 600;
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
  color: #1B1D22;
  background: #FFFFFF;
  font-weight: 600;
  padding: 10px 16px;
  border-radius: 4px;
  margin-right: 6px;
  }
`;

const DeclineButton = styled.button`
  &&& {
  color: #D24B4E;
  background: rgba(210, 75, 78, 0.08);
  font-weight: 600;
  padding: 10px 16px;
  border-radius: 4px;
  margin-left: 6px;
  }
`;

const Icon = styled.div<{fill?: string, color?: string}>`
  font-size: 18px;
  line-height: 18px;
  fill: ${({fill}) => (fill || 'currentColor')};
  color: ${({color}) => (color || 'currentColor')};
`;

const CloseButton = styled(Icon)`
  cursor: pointer;
  color: rgba(221, 223, 228, 0.56);

  :hover {
    background: rgba(var(--center-channel-color-rgb), 0.08);
  }
`;

const ErrorMsg = styled.i`
  color: rgba(var(--center-channel-color-rgb), 0.72);
`;
