import React from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import styled, {css} from 'styled-components';

import CompassIcon from 'src/components/icons/compassIcon';
import Shortcut from 'src/components/shortcut';

export type Props = {
    id: string,
    icon: React.ReactNode,
    bgColor: string,
    toolTipText: string,
    toolTipSubText?: string,
    onToggle?: () => void,
    unavailable?: boolean,
    disabled?: boolean,
    iconFill?: string,
    shortcut?: string,
}

export default function WidgetButton(props: Props) {
    return (
        <OverlayTrigger
            key={props.id}
            placement='top'
            overlay={
                props.disabled ||
                <Tooltip id={`tooltip-${props.id}`}>
                    <div>{props.toolTipText}</div>
                    {props.toolTipSubText &&
                    <TooltipSubText>
                        {props.toolTipSubText}
                    </TooltipSubText>
                    }
                    { props.shortcut &&
                    <Shortcut shortcut={props.shortcut}/>
                    }
                </Tooltip>
            }
        >
            <Button
                id={props.id}
                className='cursor--pointer style--none button-controls'
                // eslint-disable-next-line no-undefined
                onClick={props.disabled ? undefined : props.onToggle}
                bgColor={props.bgColor}
                isDisabled={props.disabled}
                isUnavailable={props.unavailable}
                disabled={props.disabled}
            >
                { props.unavailable &&
                <UnavailableIcon>
                    <CompassIcon icon='close-circle'/>
                </UnavailableIcon>
                }
                {props.icon}
            </Button>
        </OverlayTrigger>
    );
}

const Button = styled.button<{bgColor: string, isDisabled?: boolean, isUnavailable?: boolean}>`
  &&& {
    position: relative;
    background-color: ${({bgColor}) => bgColor};
    width: auto;
    padding: 0 6px;

    svg {
      ${({isDisabled, isUnavailable}) => (isDisabled || isUnavailable) && css`
        fill: rgba(var(--center-channel-color-rgb), 0.32);
      `}
    }

    ${({isDisabled, isUnavailable}) => (isDisabled || isUnavailable) && css`
      :hover {
        background-color: transparent;
      }
    `}
  }
`;

const UnavailableIcon = styled.div<{}>`
  position: absolute;
  top: -2px;
  right: -2px;
  color: var(--dnd-indicator);
  font-size: 12px;

  &&& {
    i {
      border-radius: 50%;
      background-color: var(--center-channel-bg);
    }
  }
`;

const TooltipSubText = styled.div`
  opacity: 0.56;
`;
