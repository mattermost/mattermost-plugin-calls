import styled, {css} from 'styled-components';

export const CallButton = styled.button<{ restricted: boolean, noBorder?: boolean }>`
    // &&& is to override the call-button styles
    &&& {
        ${(props) => props.restricted && !props.noBorder && css`
            border: 1px solid rgba(var(--center-channel-color-rgb), 0.16);
            cursor: pointer;
        `}
    }

`;

export const UpsellIcon = styled.i`
    // &&&&& is to override the call-button styles
    &&&&& {
      position: absolute;
      right: 48px;
      top: 12px;
      color: var(--button-bg);
      width: 16px;
      height: 16px;
      background-color: var(--center-channel-bg);
      border-radius: 50%;
    }
`;

