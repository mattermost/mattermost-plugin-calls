import React, {useState} from 'react';
import CompassIcon from 'src/components/icons/compassIcon';
import styled from 'styled-components';

type Props = {
    id: string,
    type: string,
    icon: string | React.ReactNode,
    iconFill?: string,
    iconColor?: string,
    body?: string | React.ReactNode,
    header: string,
    leftText?: string,
    rightText?: string,
    onLeftButtonClick?: () => void,
    onRightButtonClick?: () => void,
    onCloseButtonClick?: () => void,
    leftButton?: typeof DefaultLeftButton;
    rightButton?: typeof DefaultRightButton;
}

const colorMap: { [key: string]: string } = {
    error: 'var(--button-color)',
    warning: 'rgb(63, 67, 80)',
    info: 'var(--center-channel-color)',
};

const hoverMap: { [key: string]: string } = {
    error: 'rgba(var(--button-color-rgb), 0.08)',
    warning: 'rgba(63, 67, 80, 0.08)',
    info: 'rgba(var(--center-channel-color-rgb), 0.08)',
};

const bgMap: { [key: string]: string } = {
    error: 'var(--dnd-indicator)',
    warning: 'rgb(255, 188, 31)',
    info: 'var(--center-channel-bg)',
};

export default function WidgetBanner({
    leftButton: LeftButton = DefaultLeftButton,
    rightButton: RightButton = DefaultRightButton,
    ...props
}: Props) {
    const [leftButtoning, setLeftButtoning] = useState(false);
    const [rightButtoning, setRightButtoning] = useState(false);
    const [closeButtoning, setCloseButtoning] = useState(false);

    const onAnimationEnd = () => {
        if (leftButtoning && props.onLeftButtonClick) {
            props.onLeftButtonClick();
        }
        if (rightButtoning && props.onRightButtonClick) {
            props.onRightButtonClick();
        }
        if (closeButtoning && props.onCloseButtonClick) {
            props.onCloseButtonClick();
        }
    };

    return (
        <Banner
            data-testid={props.id}
            onAnimationEnd={onAnimationEnd}
            $color={colorMap[props.type]}
            $bgColor={bgMap[props.type]}
            $fadeIn={!leftButtoning && !rightButtoning && !closeButtoning}
        >
            <Icon
                $fill={props.iconFill}
                $color={props.iconColor}
            >
                {typeof props.icon === 'string' &&
                    <CompassIcon icon={props.icon}/>
                }

                {typeof props.icon !== 'string' &&
                    props.icon
                }
            </Icon>

            <Main>
                <Header>
                    <HeaderText>{props.header}</HeaderText>
                </Header>
                {props.body &&
                    <Body>
                        <BodyText>{props.body}</BodyText>
                    </Body>
                }
                {((props.leftText && props.onLeftButtonClick) || (props.onRightButtonClick && props.rightText)) &&
                    <Footer>
                        {props.leftText && props.onLeftButtonClick &&
                            <LeftButton
                                className='cursor--pointer style--none'
                                onClick={() => setLeftButtoning(true)}
                            >
                                {props.leftText}
                            </LeftButton>
                        }

                        {props.rightText && props.onRightButtonClick &&
                            <RightButton
                                className='cursor--pointer style--none'
                                onClick={() => setRightButtoning(true)}
                            >
                                {props.rightText}
                            </RightButton>
                        }
                    </Footer>
                }
            </Main>

            {props.onCloseButtonClick &&
                <CloseButton
                    $bgHover={hoverMap[props.type]}
                    data-testid={'calls-widget-banner-close'}
                    onClick={() => setCloseButtoning(true)}
                >
                    <CompassIcon icon='close'/>
                </CloseButton>
            }
        </Banner>
    );
}

const Banner = styled.div<{ $color: string, $bgColor: string, $fadeIn: boolean }>`
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
    overflow-x: hidden;
    background-color: ${({$bgColor}) => $bgColor};
    box-shadow: 0 8px 24px rgba(var(--center-channel-color-rgb), 0.12);
    padding: 4px 8px 6px 8px;
    border-radius: 4px;
    color: ${({$color}) => $color};
    animation: ${({$fadeIn}) => ($fadeIn ? 'fade-in 0.3s ease-in' : 'fade-out 0.3s ease-out')};

    a, a:hover, a:visited {
        color: ${({$color}) => $color};
    }
`;

const Main = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;

    font-style: normal;
    font-size: 11px;
    line-height: 16px;
    letter-spacing: 0.02em;
    margin: 4px 4px;
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

export const DefaultLeftButton = styled.button`
    color: var(--button-bg);
    font-weight: 600;
    padding: 4px 10px;
    margin-right: 2px;
    border-radius: 4px;
    background: rgba(var(--center-channel-color-rgb), 0.08);
`;

export const DefaultRightButton = styled.button`
    color: var(--dnd-indicator);
    font-weight: 600;
    padding: 4px 10px;
    margin-left: 2px;
    border-radius: 4px;
    background: rgba(var(--dnd-indicator-rgb), 0.08);
`;

const Icon = styled.div<{ $fill?: string, $color?: string }>`
    font-size: 12px;
    fill: ${({$fill}) => ($fill || 'currentColor')};
    color: ${({$color}) => ($color || 'currentColor')};
    margin-top: 4px;
`;

const CloseButton = styled(Icon)<{ $bgHover: string }>`
    cursor: pointer;
    margin-top: 4px;
    border-radius: 2px;
    app-region: no-drag;

    &:hover {
        background: ${({$bgHover}) => $bgHover};
    }
`;
