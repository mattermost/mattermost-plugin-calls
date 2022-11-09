import React, {useState} from 'react';
import styled, {css} from 'styled-components';

import CompassIcon from 'src/components/icons/compassIcon';

type Props = {
    type: string,
    icon: string,
    iconFill?: string,
    iconColor?: string,
    body?: string | React.ReactNode,
    header: string,
    confirmText?: string,
    onClose?: () => void,
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

    const onAnimationEnd = () => {
        if (closing && props.onClose) {
            props.onClose();
        }
    };

    return (
        <Banner
            color={colorMap[props.type]}
            bgColor={bgMap[props.type]}
            fadeIn={!closing}
            onAnimationEnd={onAnimationEnd}
        >
            <Header>
                <Icon
                    fill={props.iconFill}
                    color={props.iconColor}
                >
                    <CompassIcon icon={props.icon}/>
                </Icon>
                <HeaderText>{props.header}</HeaderText>
                { props.onClose &&
                <CloseButton
                    onClick={() => setClosing(true)}
                >
                    <CompassIcon icon='close'/>
                </CloseButton>
                }
            </Header>
            <Body>
                { props.body &&
                <BodyText>{props.body}</BodyText>
                }
            </Body>
            <Footer>
                { props.confirmText && props.onClose &&
                <ConfirmButton
                    className='cursor--pointer style--none'
                    onClick={() => setClosing(true)}
                >
                    {props.confirmText}
                </ConfirmButton>
                }
            </Footer>
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
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  background-color: ${({bgColor}) => bgColor};
  padding: 5px 8px;
  border-radius: 4px;
  color: ${({color}) => color};
  margin-top: 4px;
  animation: ${({fadeIn}) => (fadeIn ? 'fade-in 0.3s ease-in' : 'fade-out 0.3s ease-out')};

  a, a:hover, a:visited {
    color: ${({color}) => color};
  }

  font-style: normal;
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.02em;
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  width: 100%;
`;

const HeaderText = styled.span`
  flex: 1;
  margin: 0 4px;
  font-weight: 600;
`;

const Body = styled.div`
  display: flex;
  align-items: flex-start;
`;

const BodyText = styled.div`
  flex: 1;
  font-weight: 400;
  margin: 4px 16px;
`;

const Footer = styled.div`
  display: flex;
  align-items: flex-start;
`;

const ConfirmButton = styled.button`
  color: var(--button-bg);
  margin: 4px 16px;
  font-weight: 600;
`;

const Icon = styled.div<{fill?: string, color?: string}>`
  margin-left: -5px;
  font-size: 12px;
  line-height: 16px;
  fill: ${({fill}) => (fill || 'currentColor')};
  color: ${({color}) => (color || 'currentColor')};
`;

const CloseButton = styled(Icon)`
  cursor: pointer;
  margin-right: -5px;

  :hover {
    background: rgba(var(--center-channel-color-rgb), 0.08);
  }
`;
