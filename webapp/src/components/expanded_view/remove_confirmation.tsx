import {UserProfile} from '@mattermost/types/users';
import React from 'react';
import {useIntl} from 'react-intl';
import InCallPrompt, {DefaultLeftButton, DefaultRightButton} from 'src/components/expanded_view/in_call_prompt';
import CompassIcon from 'src/components/icons/compassIcon';
import {getUserDisplayName} from 'src/utils';
import styled from 'styled-components';

type Props = {
    profile: UserProfile;
    onConfirm: () => void;
    onCancel: () => void;
}

export const RemoveConfirmation = ({profile, onConfirm, onCancel}: Props) => {
    const {formatMessage} = useIntl();

    // @ts-ignore
    const body = formatMessage({
        defaultMessage: 'Are you sure you want to remove <b>{userName}</b> from the call?',
    }, {
        userName: getUserDisplayName(profile),
        b: (text: string) => <b>{text}</b>,
    });

    return (
        <InCallPrompt
            testId={'remove-confirmation'}
            icon={<StyledCompassIcon icon='minus-circle-outline'/>}
            iconFill='rgb(var(--dnd-indicator-rgb))'
            iconColor='rgb(var(--dnd-indicator-rgb))'
            header={formatMessage({defaultMessage: 'Remove participant'})}
            body={body}
            leftText={formatMessage({defaultMessage: 'Yes, remove'})}
            onLeftButtonClick={onConfirm}
            rightText={formatMessage({defaultMessage: 'Cancel'})}
            onRightButtonClick={onCancel}
            onCloseButtonClick={onCancel}
            leftButton={StyledLeftButton}
            rightButton={StyledRightButton}
        />
    );
};

const StyledCompassIcon = styled(CompassIcon)`
    font-size: 24px;
`;

const StyledLeftButton = styled(DefaultLeftButton)`
    background: var(--dnd-indicator);
    font-size: 12px;
    line-height: 16px;
    padding: 8px 16px;
    margin-right: 4px;

    &:hover {
        background: rgba(var(--dnd-indicator-rgb), 0.9);
    }
`;

const StyledRightButton = styled(DefaultRightButton)`
    color: var(--button-bg);
    background: rgba(var(--button-bg-rgb), 0.08);
    font-size: 12px;
    line-height: 16px;
    padding: 8px 16px;
    margin-left: 0;

    &:hover {
        background: rgba(var(--button-bg-rgb), 0.04);
    }
`;
