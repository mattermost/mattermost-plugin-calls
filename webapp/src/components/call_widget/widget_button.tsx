import React, {CSSProperties, useRef, useState} from 'react';
import {Overlay} from 'react-bootstrap';
import {StyledTooltip} from 'src/components/shared';
import Shortcut from 'src/components/shortcut';
import styled, {css} from 'styled-components';

import UnavailableIconWrapper from './unavailable_icon_wrapper';

export type Props = {
    id: string,
    icon: React.ReactNode,
    bgColor: string,
    bgColorHover?: string,
    tooltipText?: string,
    tooltipSubtext?: string,
    tooltipPosition?: string,
    onToggle?: () => void,
    unavailable?: boolean,
    disabled?: boolean,
    shortcut?: string,
    style?: CSSProperties,
    children?: React.ReactNode,
}

export default function WidgetButton(props: Props) {
    const [show, setShow] = useState(false);
    const target = useRef<HTMLButtonElement>(null);

    return (
        <>
            <Button
                ref={target}
                id={props.id}
                onMouseOver={() => setShow(true)}
                onMouseOut={() => setShow(false)}
                className='cursor--pointer style--none'
                // eslint-disable-next-line no-undefined
                onClick={props.disabled ? undefined : props.onToggle}
                disabled={props.disabled}
                style={props.style}
                $bgColor={props.bgColor}
                $bgColorHover={props.bgColorHover}
                $isDisabled={props.disabled}
                $isUnavailable={props.unavailable}
            >
                <UnavailableIconWrapper
                    icon={props.icon}
                    unavailable={Boolean(props.unavailable)}
                />
                {props.children || null}
            </Button>
            { props.tooltipText &&
            <Overlay
                key={props.id}
                target={target.current as HTMLButtonElement}
                show={show}
                placement={props.tooltipPosition || 'top'}
            >
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
            </Overlay>
            }
        </>
    );
}

const Button = styled.button<{$bgColor: string, $bgColorHover?: string, $isDisabled?: boolean, $isUnavailable?: boolean}>`
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 4px;
  gap: 3px;
  color: rgba(var(--center-channel-color-rgb), 0.64);

  &&&&:hover {
    background: ${({$bgColorHover}) => $bgColorHover || 'rgba(var(--center-channel-color-rgb), 0.12)'};
  }

  svg {
    fill: rgba(var(--center-channel-color-rgb), 0.64);
  }

  &&& {
    padding: 5px;
    background-color: ${({$bgColor}) => $bgColor};

    ${({$isDisabled, $isUnavailable}) => ($isDisabled || $isUnavailable) && css`
      :hover {
        background-color: transparent;
      }
    `}
  }
`;

const TooltipSubtext = styled.div`
  opacity: 0.56;
`;
