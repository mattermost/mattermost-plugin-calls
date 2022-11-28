import React, {useRef} from 'react';
import {OverlayTrigger} from 'react-bootstrap';
import styled, {css} from 'styled-components';

import CompassIcon from 'src/components/icons/compassIcon';
import Shortcut from 'src/components/shortcut';
import {StyledTooltip} from 'src/components/shared';

export type Props = {
    id: string,
    icon: React.ReactNode,
    bgColor: string,
    text?: string,
    tooltipText: string,
    tooltipSubtext?: string,
    onToggle?: () => void,
    unavailable?: boolean,
    disabled?: boolean,
    iconFill?: string,
    shortcut?: string,
    margin?: string,
}

export default function ControlsButton(props: Props) {
    const overlayRef = useRef();

    const onClick = () => {
        if (props.disabled) {
            return;
        }

        // @ts-ignore
        overlayRef.current?.hide();
        props.onToggle?.();
    };

    return (
        <OverlayTrigger

            /* @ts-ignore */
            ref={overlayRef}
            key={props.id}
            placement='top'
            overlay={
                <StyledTooltip
                    id={`tooltip-${props.id}`}
                    $isDisabled={props.disabled}
                >
                    <div>{props.tooltipText}</div>
                    {props.tooltipSubtext &&
                        <TooltipSubtext>
                            {props.tooltipSubtext}
                        </TooltipSubtext>
                    }
                    {props.shortcut &&
                        <Shortcut shortcut={props.shortcut}/>
                    }
                </StyledTooltip>
            }
        >
            <ButtonContainer
                id={props.id}
                margin={props.margin}
            >
                <Button
                    className='button-center-controls'
                    // eslint-disable-next-line no-undefined
                    onClick={onClick}
                    bgColor={props.bgColor}
                    isDisabled={props.disabled}
                    isUnavailable={props.unavailable}
                    disabled={props.disabled}
                >
                    <ButtonIcon>
                        {props.icon}
                        {props.unavailable &&
                            <UnavailableIcon>
                                <CompassIcon icon='close-circle'/>
                            </UnavailableIcon>
                        }
                    </ButtonIcon>
                </Button>
                {props.text &&
                    <ButtonText>{props.text}</ButtonText>
                }
            </ButtonContainer>
        </OverlayTrigger>
    );
}

const ButtonContainer = styled.div<{ margin?: string }>`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin: ${({margin}) => margin || '0 16px'};
`;

const Button = styled.button<{ bgColor: string, isDisabled?: boolean, isUnavailable?: boolean }>`
    background-color: ${({bgColor}) => bgColor};

    ${({isDisabled, isUnavailable}) => (isDisabled || isUnavailable) && css`
        background-color: rgba(255, 255, 255, 0.08);
    `}
    svg {
        fill: white;
        ${({isDisabled, isUnavailable}) => (isDisabled || isUnavailable) && css`
            fill: rgba(255, 255, 255, 0.32);
        `}
    }

    ${({isDisabled, isUnavailable}) => (isDisabled || isUnavailable) && css`
        :hover {
            background: rgba(255, 255, 255, 0.08);
        }
    `}
`;

const ButtonText = styled.span`
    font-size: 14px;
    font-weight: 600;
    margin-top: 12px;
`;

const ButtonIcon = styled.div`
    position: relative;
`;

const UnavailableIcon = styled.div`
    position: absolute;
    top: -6px;
    right: -6px;
    color: var(--dnd-indicator);
    font-size: 14px;

    i {
        border-radius: 50%;
        background-color: rgb(54, 55, 59);
    }
`;

const TooltipSubtext = styled.div`
    opacity: 0.56;
`;
