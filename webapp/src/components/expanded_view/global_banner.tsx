import React from 'react';
import CompassIcon from 'src/components/icons/compassIcon';
import styled from 'styled-components';

const colorMap = {
    error: 'var(--button-color)',
    warning: 'var(--center-channel-bg)',
};

const bgMap = {
    error: 'var(--dnd-indicator)',
    warning: 'var(--away-indicator)',
};

export type Props = {
    type: 'error' | 'warning',
    icon: string,
    body: string | React.ReactNode,
    onClose?: () => void,
}

export default function GlobalBanner(props: Props) {
    return (
        <Banner
            $color={colorMap[props.type]}
            $bgColor={bgMap[props.type]}
        >
            <Icon>
                <CompassIcon icon={props.icon}/>
            </Icon>
            <Body>{props.body}</Body>
            { props.onClose &&
            <CloseButton
                className='style--none'
                onClick={props.onClose}
            >
                <CompassIcon icon='close'/>
            </CloseButton>
            }
            { !props.onClose &&
            <RightFiller/>
            }
        </Banner>
    );
}

const Banner = styled.div<{$color: string, $bgColor: string}>`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 40px;
  background-color: ${({$bgColor}) => $bgColor};
  font-size: 14px;
  color: ${({$color}) => $color};

  a, a:hover, a:visited {
    color: ${({$color}) => $color};
  }

  i {
    font-size: 18px;
  }
`;

const Body = styled.span`
  font-weight: 600;
  line-height: 20px;
`;

const CloseButton = styled.button`
  cursor: pointer;
  margin-left: auto;
  opacity: 0.56;
`;

const Icon = styled.div`
  margin-left: auto;
`;

const RightFiller = styled.div`
  margin-left: auto;
`;
