import React, {useState} from 'react';
import styled from 'styled-components';

import CompassIcon from 'src/components/icons/compassIcon';

type Props = {
    id: string,
    type: string,
    icon: string | React.ReactNode,
    iconFill?: string,
    iconColor?: string,
    body?: string | React.ReactNode,
    header: string,
    confirmText?: string | null,
    declineText?: string | null,
    onClose?: () => void,
    onDecline?: () => void,
}

const colorMap: {[key: string]: string} = {
    error: 'var(--button-color)',
    warning: 'var(--center-channel-color)',
    info: 'var(--center-channel-color)',
};

const bgMap: {[key: string]: string} = {
    error: 'var(--dnd-indicator)',
    warning: 'var(--away-indicator)',
    info: 'var(--center-channel-bg)',
};

export default function WidgetBanner(props: Props) {
    const [closing, setClosing] = useState(false);
    const [declining, setDeclining] = useState(false);

    const onAnimationEnd = () => {
        if (closing && props.onClose) {
            props.onClose();
        }
        if (declining && props.onDecline) {
            props.onDecline();
        }
    };

    return (
        <Banner
            data-testid={props.id}
            color={colorMap[props.type]}
            bgColor={bgMap[props.type]}
            fadeIn={!closing && !declining}
            onAnimationEnd={onAnimationEnd}
        >
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
                    <HeaderText>{props.header}</HeaderText>
                </Header>
                <Body>
                    { props.body &&
                    <BodyText>{props.body}</BodyText>
                    }
                </Body>
                { ((props.confirmText && props.onClose) || (props.onDecline && props.declineText)) &&
                    <Footer>
                        { props.confirmText && props.onClose &&
                        <ConfirmButton
                            className='cursor--pointer style--none'
                            onClick={() => setClosing(true)}
                        >
                            {props.confirmText}
                        </ConfirmButton>
                        }

                        { props.declineText && props.onDecline &&
                        <DeclineButton
                            className='cursor--pointer style--none'
                            onClick={() => setDeclining(true)}
                        >
                            {props.declineText}
                        </DeclineButton>
                        }
                    </Footer>
                }
            </Main>

            { props.onClose &&
                <CloseButton
                    data-testid={'calls-widget-banner-close'}
                    onClick={() => setClosing(true)}
                >
                    <CompassIcon icon='close'/>
                </CloseButton>
            }
        </Banner>
    );
}

const Banner = styled.div<{color: string, bgColor: string, fadeIn: boolean}>`
  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(100%);
    }
    to {
      opacity: 1;
      transform: translateY(0%);
    }
  }

  @keyframes fade-out {
    from {
      opacity: 1;
      transform: translateY(0%);
    }
    to {
      opacity: 0;
      transform: translateY(100%);
    }
  }

  display: flex;
  align-items: flex-start;
  width: 100%;
  background-color: ${({bgColor}) => bgColor};
  box-shadow: 0 8px 24px rgba(var(--center-channel-color-rgb), 0.12);
  padding: 5px 8px;
  border-radius: 4px;
  color: ${({color}) => color};
  margin-top: 4px;
  animation: ${({fadeIn}) => (fadeIn ? 'fade-in 0.3s ease-in' : 'fade-out 0.3s ease-out')};

  a, a:hover, a:visited {
    color: ${({color}) => color};
  }
`;

const Main = styled.div`
  display: flex;
  flex-direction: column;

  font-style: normal;
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.02em;
  margin: 0 4px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
`;

const HeaderText = styled.span`
  flex: 1;
  font-weight: 600;
`;

const Body = styled.div`
  display: flex;
  align-items: flex-start;
  margin-top: 4px;
`;

const BodyText = styled.div`
  flex: 1;
  font-weight: 400;
`;

const Footer = styled.div`
  display: flex;
  align-items: flex-start;
  margin-top: 8px;
`;

const ConfirmButton = styled.button`
  &&& {
    color: var(--button-bg);
    font-weight: 600;
    padding: 4px 10px;
    margin-right: 2px;
    border-radius: 4px;
    background: rgba(var(--center-channel-color-rgb), 0.08);
  }
`;

const DeclineButton = styled.button`
  &&& {
    color: var(--dnd-indicator);
    font-weight: 600;
    padding: 4px 10px;
    margin-left: 2px;
    border-radius: 4px;
    background: rgba(var(--dnd-indicator-rgb), 0.08);
  }
`;

const Icon = styled.div<{fill?: string, color?: string}>`
  font-size: 12px;
  fill: ${({fill}) => (fill || 'currentColor')};
  color: ${({color}) => (color || 'currentColor')};
  margin-top: 4px;
`;

const CloseButton = styled(Icon)`
  cursor: pointer;
  margin-top: 4px;
  app-region: no-drag;

  :hover {
    background: rgba(var(--center-channel-color-rgb), 0.08);
  }
`;
