import React, {useState} from 'react';
import {useIntl} from 'react-intl';
import styled, {css} from 'styled-components';

export type Props = {
    id: string,
    text: string,
    textSize: number,
    lineHeight?: number,
    icon: React.ReactNode,
    hoverIcon?: React.ReactNode,
    gap: number,
    iconFill?: string,
    bgColor?: string,
    margin?: string,
    padding?: string,
    loading?: boolean,
    color?: string,
}

export function Badge(props: Props) {
    const [hoverState, setHoverState] = useState(false);

    const toggleHover = () => {
        setHoverState(!hoverState);
    };

    return (
        <Container
            onMouseEnter={toggleHover}
            onMouseLeave={toggleHover}
            data-testid={props.id}
            $bgColor={props.bgColor}
            $size={props.textSize}
            $lineHeight={props.lineHeight || props.textSize}
            $margin={props.margin}
            $padding={props.padding}
            $color={props.color}
        >
            {props.loading &&
                <Spinner $size={props.textSize}/>
            }

            {!props.loading && !hoverState &&
                <Icon $fill={props.iconFill}>{props.icon}</Icon>
            }

            {!props.loading && hoverState &&
                <Icon $fill={props.iconFill}>{props.hoverIcon || props.icon}</Icon>
            }

            <Text $gap={props.gap}>{props.text}</Text>
        </Container>
    );
}

type ContainerProps = {
    $bgColor?: string,
    $size: number,
    $lineHeight: number,
    $margin?: string,
    $padding?: string,
    $color?: string,
}

const Container = styled.div<ContainerProps>`
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: ${({$bgColor}) => $bgColor || 'transparent'};
    border-radius: 4px;
    margin: ${({$margin}) => $margin || 0};
    padding: ${({$padding}) => $padding || 0};
    font-size: ${({$size}) => $size}px;
    line-height: ${({$lineHeight}) => $lineHeight}px;
    color: ${({$color}) => $color || 'currentColor'};
`;

const Text = styled.span<{ $gap: number }>`
    font-weight: 600;
    margin-left: ${({$gap}) => $gap}px;
`;

const Icon = styled.div<{ $fill?: string }>`
    display: flex;
    fill: ${({$fill}) => $fill || 'currentColor'};
`;

const Spinner = styled.span<{ $size: number }>`
    width: ${({$size}) => $size}px;
    height: ${({$size}) => $size}px;
    border-radius: 50%;
    display: inline-block;
    border-top: 2px solid currentColor;
    border-right: 2px solid transparent;
    box-sizing: border-box;
    animation: spin 1s linear infinite;

    @keyframes spin {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }
`;

type HostBadgeProps = {
    onWhiteBg?: boolean;
}

export const HostBadge = ({onWhiteBg, ...rest}: HostBadgeProps) => {
    const {formatMessage} = useIntl();

    return (
        <div
            style={{padding: '1px 2px'}}
            {...rest}
        >
            <HBadge $onWhiteBg={onWhiteBg}>
                {formatMessage({defaultMessage: 'Host'})}
            </HBadge>
        </div>
    );
};

const HBadge = styled.div<{ $onWhiteBg?: boolean }>`
    font-weight: 600;
    padding: 0 4px;
    text-transform: uppercase;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    font-size: 10px;
    line-height: 16px;
    ${({$onWhiteBg}) => $onWhiteBg && css`
        background: rgba(var(--center-channel-color-rgb), 0.08);
    `}
`;
