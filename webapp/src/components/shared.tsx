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

export const HorizontalSpacer = styled.div<{ $size: number }>`
    margin-left: ${(props) => props.$size}px;
`;

export const VerticalSpacer = styled.div<{ $size: number }>`
    margin-top: ${(props) => props.$size}px;
`;

export const StyledTooltip = styled(Tooltip)<{$isDisabled?: boolean}>`
  ${({$isDisabled}) => $isDisabled && css`
      display: none;
  `}
`;

export const Spinner = styled.span<{$size: number}>`
  width: ${({$size}) => $size}px;
  height: ${({$size}) => $size}px;
  border-radius: 50%;
  display: inline-block;
  border-top: 2px solid #166DE0;
  border-right: 2px solid transparent;
  box-sizing: border-box;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
`;
