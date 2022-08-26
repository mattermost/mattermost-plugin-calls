import React from 'react';
import styled, {css} from 'styled-components';

import CompassIcon from 'src/components/icons/compassIcon';

export type Props = {
    type: 'error' | 'warning',
    icon: string,
    body: string | React.ReactNode,
    onClose?: () => void,
}

const colorMap = {
    error: 'var(--button-color)',
    warning: 'var(--center-channel-color)',
};

const bgMap = {
    error: 'var(--dnd-indicator)',
    warning: 'var(--away-indicator)',
};

export function WidgetBanner(props: Props) {
    return (
        <Banner
            color={colorMap[props.type]}
            bgColor={bgMap[props.type]}
        >
            <Icon><CompassIcon icon={props.icon}/></Icon>
            <Body>{props.body}</Body>
            { props.onClose &&
            <Icon
                isClose={true}
                onClick={props.onClose}
            ><CompassIcon icon='close'/></Icon>
            }
        </Banner>
    );
}

const Banner = styled.div<{color: string, bgColor: string}>`
  display: flex;
  align-items: flex-start;
  width: 100%;
  background-color: ${({bgColor}) => bgColor};
  padding: 5px 8px;
  border-radius: 4px;
  color: ${({color}) => color};
  margin-top: 4px;

  a, a:hover, a:visited {
    color: ${({color}) => color};
  }
`;

const Body = styled.span<{}>`
  font-style: normal;
  font-weight: 600;
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.02em;
  margin: 0 4px;
`;

const Icon = styled.div<{isClose?: boolean}>`
  margin-left: ${({isClose}) => (isClose ? '0' : '-5px')};
  margin-right: ${({isClose}) => (isClose ? '-5px' : '0')};
  ${({isClose}) => isClose && css`
      cursor: pointer;
  `}
  font-size: 12px;
  line-height: 16px;
`;
