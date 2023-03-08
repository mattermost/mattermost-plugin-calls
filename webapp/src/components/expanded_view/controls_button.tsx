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
                bgColor={props.bgColor}
                margin={props.margin}
                onClick={onClick}
                disabled={props.disabled}
                isDisabled={props.disabled}
                isUnavailable={props.unavailable}
                fill={props.iconFill}
            >
                <ButtonIcon>
                    {props.icon}
                    {props.unavailable &&
                        <UnavailableIcon>
                            <CompassIcon icon='close-circle'/>
                        </UnavailableIcon>
                    }
                </ButtonIcon>
                {props.text &&
                    <ButtonText>{props.text}</ButtonText>
                }
            </ButtonContainer>
        </OverlayTrigger>
    );
}

const ButtonContainer = styled.button<{bgColor: string, margin?: string, isDisabled?: boolean, isUnavailable?: boolean, fill?: string}>`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin: ${({margin}) => margin || '0 8px'};
    border-radius: 8px;
    padding: 12px;
    border: none;
    background-color: ${({bgColor}) => bgColor || 'rgba(var(--center-channel-bg-rgb), 0.08)'};

    :hover {
      color: rgba(28, 88, 217);
      background: rgba(var(--center-channel-bg-rgb), 0.32);
    }

    svg {
      fill: ${({fill}) => fill || 'rgba(var(--center-channel-bg-rgb), 0.56)'};
      ${({isDisabled, isUnavailable}) => (isDisabled || isUnavailable) && css`
        fill: rgba(var(--center-channel-bg-rgb), 0.32);
      `}
    }

    ${({isDisabled, isUnavailable}) => (isDisabled || isUnavailable) && css`
      :hover {
          background-color: rgba(var(--center-channel-bg-rgb), 0.08);
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
    font-size: 0px;
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
