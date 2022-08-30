import React from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import styled, {css} from 'styled-components';

import CompassIcon from 'src/components/icons/compassIcon';
import Shortcut from 'src/components/shortcut';

export type Props = {
    id: string,
    icon: React.ReactNode,
    bgColor: string,
    text?: string,
    toolTipText: string,
    toolTipSubText?: string,
    onToggle?: () => void,
    unavailable?: boolean,
    disabled?: boolean,
    iconFill?: string,
    shortcut?: string,
}

export default function ControlsButton(props: Props) {
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
            <ButtonContainer
                id={props.id}
            >
                <Button
                    className='button-center-controls'
                    // eslint-disable-next-line no-undefined
                    onClick={props.disabled ? undefined : props.onToggle}
                    bgColor={props.bgColor}
                    isDisabled={props.disabled}
                    isUnavailable={props.unavailable}
                    disabled={props.disabled}
                >
                    <ButtonIcon>
                        {props.icon}
                        { props.unavailable &&
                        <UnavailableIcon>
                            <CompassIcon icon='close-circle'/>
                        </UnavailableIcon>
                        }
                    </ButtonIcon>
                </Button>
                { props.text &&
                <ButtonText>{props.text}</ButtonText>
                }
            </ButtonContainer>
        </OverlayTrigger>
    );
}

const ButtonContainer = styled.div`
   display: flex;
   flex-direction: column;
   align-items: center;
   justify-content: center;
   margin: 0 8px;
   width: 112px;
`;

const Button = styled.button<{bgColor: string, isDisabled?: boolean, isUnavailable?: boolean}>`
  &&& {
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
        background-color: transparent;
      }
    `}
  }
`;

const ButtonText = styled.span`
  font-size: 14px;
  font-weight: 600;
  margin-top: 12px;
`;

const ButtonIcon = styled.div`
  position: relative;
`;

const UnavailableIcon = styled.div<{}>`
  position: absolute;
  top: -6px;
  right: -6px;
  color: var(--dnd-indicator);
  font-size: 14px;

  &&& {
    i {
      border-radius: 50%;
      background-color: rgb(54, 55, 59);
    }
  }
`;

const TooltipSubText = styled.div`
  opacity: 0.56;
`;
