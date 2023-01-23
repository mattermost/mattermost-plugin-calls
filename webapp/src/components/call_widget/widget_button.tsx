import React, {useRef, useState} from 'react';
import {Overlay} from 'react-bootstrap';
import styled, {css} from 'styled-components';

import Shortcut from 'src/components/shortcut';
import {StyledTooltip} from 'src/components/shared';

import UnavailableIconWrapper from './unavailable_icon_wrapper';

export type Props = {
    id: string,
    icon: React.ReactNode,
    bgColor: string,
    tooltipText: string,
    tooltipSubtext?: string,
    onToggle?: () => void,
    unavailable?: boolean,
    disabled?: boolean,
    iconFill?: string,
    shortcut?: string,
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
                className='cursor--pointer style--none button-controls'
                // eslint-disable-next-line no-undefined
                onClick={props.disabled ? undefined : props.onToggle}
                bgColor={props.bgColor}
                isDisabled={props.disabled}
                isUnavailable={props.unavailable}
                disabled={props.disabled}
            >
                <UnavailableIconWrapper
                    icon={props.icon}
                    unavailable={Boolean(props.unavailable)}
                />
            </Button>
            <Overlay
                key={props.id}
                target={target.current as HTMLButtonElement}
                show={show}
                placement='top'
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
        </>
    );
}

const Button = styled.button<{bgColor: string, isDisabled?: boolean, isUnavailable?: boolean}>`
  &&& {
    background-color: ${({bgColor}) => bgColor};

    ${({isDisabled, isUnavailable}) => (isDisabled || isUnavailable) && css`
      :hover {
        background-color: transparent;
      }
    `}
  }
`;

const TooltipSubtext = styled.div`
  opacity: 0.56;
`;
