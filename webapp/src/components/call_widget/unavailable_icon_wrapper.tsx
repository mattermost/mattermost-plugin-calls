import React from 'react';
import CompassIcon from 'src/components/icons/compassIcon';
import styled, {css} from 'styled-components';

export type Props = {
    icon: React.ReactNode,
    unavailable: boolean,
    margin?: string,
}

export default function UnavailableIconWrapper(props: Props) {
    return (
        <IconWrapper
            $unavailable={props.unavailable}
            $margin={props.margin}
        >
            { props.unavailable &&
            <UnavailableIcon>
                <CompassIcon icon='close-circle'/>
            </UnavailableIcon>
            }
            {props.icon}
        </IconWrapper>
    );
}

const IconWrapper = styled.div<{$unavailable: boolean, $margin?: string}>`
  display: flex;
  justify-content: center;
  align-items: center;
  margin: ${({$margin}) => $margin || 0};
  width: 18px;
  height: 18px;

  &&& {
    position: relative;
    line-height: 28px;

    svg {
      width: 16px;
      height: 16px;

      ${({$unavailable}) => ($unavailable) && css`
        fill: rgba(var(--center-channel-color-rgb), 0.32);
      `}
    }
  }
`;

const UnavailableIcon = styled.div`
  position: absolute;
  top: -60%;
  right: -50%;
  color: var(--dnd-indicator);
  font-size: 12px;

  &&& {
    i {
      border-radius: 50%;
      background-color: var(--center-channel-bg);
    }
  }
`;
