import styled from 'styled-components';

export const HoverMenuButton = styled.i<{disabled?: boolean}>`
    display: inline-block;
    cursor: pointer;
    width: 28px;
    height: 28px;
    padding: 1px 0 0 1px;
    &:hover {
        color: ${(props) => (props.disabled ? 'rgba(var(--center-channel-color-rgb), 0.32)' : 'rgba(var(--center-channel-color-rgb), 0.56)')};
        background-color: ${(props) => (props.disabled ? 'transparent' : 'rgba(var(--center-channel-color-rgb), 0.08)')};
    }
    color: ${(props) => (props.disabled ? 'rgba(var(--center-channel-color-rgb), 0.32)' : 'rgba(var(--center-channel-color-rgb), 0.56)')};
`;

const ChecklistHoverMenuButton = styled(HoverMenuButton)`
    width: 24px;
    height: 24px;
`;

export default ChecklistHoverMenuButton;
