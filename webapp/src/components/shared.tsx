import {Tooltip} from 'react-bootstrap';
import styled, {css} from 'styled-components';

export const Header = styled.div`
    font-weight: 600;
`;

export const SubHeader = styled.div`
    font-size: 11px;
    font-weight: 400;
    opacity: 0.56;
`;

export const HorizontalSpacer = styled.div<{ size: number }>`
    margin-left: ${(props) => props.size}px;
`;

export const VerticalSpacer = styled.div<{ size: number }>`
    margin-top: ${(props) => props.size}px;
`;

export const StyledTooltip = styled(Tooltip)<{$isDisabled?: boolean}>`
  ${({$isDisabled}) => $isDisabled && css`
      display: none;
  `}
`;
