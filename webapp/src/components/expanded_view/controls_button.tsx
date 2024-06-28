import React, {useRef} from 'react';
import {OverlayTrigger} from 'react-bootstrap';
import CompassIcon from 'src/components/icons/compassIcon';
import {StyledTooltip} from 'src/components/shared';
import Shortcut from 'src/components/shortcut';
import styled, {css} from 'styled-components';

export type Props = {
    id: string,
    icon: React.ReactNode,
    bgColor: string,
    bgColorHover?: string,
    text?: string,
    tooltipText: string,
    tooltipSubtext?: string,
    onToggle?: () => void,
    unavailable?: boolean,
    disabled?: boolean,
    iconFill?: string,
    iconFillHover?: string,
    shortcut?: string,
    margin?: string,
    dataTestId?: string,
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
                    {props.shortcut &&
                        <Shortcut shortcut={props.shortcut}/>
                    }
                    {props.tooltipSubtext &&
                        <TooltipSubtext>
                            {props.tooltipSubtext}
                        </TooltipSubtext>
                    }
                </StyledTooltip>
            }
        >
            <ButtonContainer
                id={props.id}
                data-testid={props.dataTestId}
                onClick={onClick}
                disabled={props.disabled}
                $bgColor={props.bgColor}
                $bgColorHover={props.bgColorHover}
                $margin={props.margin}
                $isDisabled={props.disabled}
                $isUnavailable={props.unavailable}
                $fill={props.iconFill}
                $fillHover={props.iconFillHover}
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

export const MentionsCounter = styled.span`
    font-weight: 700;
    font-size: 11px;
    line-height: 12px;
    color: var(--button-color);
    padding: 0 2.5px;
`;

export const UnreadDot = styled.span<{$padding: string}>`
    position: absolute;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1;
    top: 0;
    right: 0;
    transform: translate(50%, -50%);
    min-width: 8px;
    min-height: 8px;
    padding: ${({$padding}) => $padding || 0};
    background: var(--sidebar-text-active-border);
    border-radius: 8px;
    border: 2px solid color-mix(in srgb, var(--calls-bg), white 8%);
    box-sizing: content-box;
`;

export const CallThreadIcon = styled.div`
  position: relative;
`;

type ButtonContainerProps = {
    $bgColor: string,
    $bgColorHover?: string,
    $margin?: string,
    $isDisabled?: boolean,
    $isUnavailable?: boolean,
    $fill?: string,
    $fillHover?: string,
}

const ButtonContainer = styled.button<ButtonContainerProps>`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin: ${({$margin}) => $margin || '0'};
    border-radius: 8px;
    padding: 12px;
    border: none;
    background: ${({$bgColor}) => $bgColor || 'rgba(var(--button-color-rgb), 0.08)'};
    color: ${({$fill}) => $fill || 'rgba(var(--button-color-rgb), 0.56)'};

    &:hover {
      background: ${({$bgColorHover}) => $bgColorHover || 'rgba(var(--button-color-rgb), 0.12)'};
      background-blend-mode: multiply;
      color: ${({$fillHover}) => $fillHover || 'var(--button-color)'};

      svg {
        fill: ${({$fillHover}) => $fillHover || 'var(--button-color)'};
      }
    }

    &:hover ${UnreadDot} {
      border: 2px solid color-mix(in srgb, var(--calls-bg), white 12%);
    }

    svg {
      fill: ${({$fill}) => $fill || 'rgba(var(--button-color-rgb), 0.56)'};
      ${({$isDisabled, $isUnavailable}) => ($isDisabled || $isUnavailable) && css`
        fill: rgba(var(--button-color-rgb), 0.32);
      `}
    }

    ${({$isDisabled, $isUnavailable}) => ($isDisabled || $isUnavailable) && css`
      &:hover {
          background: rgba(var(--button-color-rgb), 0.08);
      }
    `}
`;

const ButtonText = styled.span`
    font-size: 16px;
    line-height: 16px;
    font-weight: 600;
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
        background: rgb(54, 55, 59);
    }
`;

const TooltipSubtext = styled.div`
    opacity: 0.56;
`;
