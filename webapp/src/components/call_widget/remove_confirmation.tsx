import {UserProfile} from '@mattermost/types/users';
import React from 'react';
import {useIntl} from 'react-intl';
import WidgetBanner, {DefaultLeftButton, DefaultRightButton} from 'src/components/call_widget/widget_banner';
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
        <WidgetBanner
            id={'calls-widget-banner-remove'}
            key={'widget_banner_remove'}
            type='info'
            icon={<StyledIcon icon='minus-circle-outline'/>}
            iconFill='rgb(var(--dnd-indicator-rgb))'
            iconColor='rgb(var(--dnd-indicator-rgb))'
            header={formatMessage({defaultMessage: 'Remove participant'})}
            body={body}
            leftText={formatMessage({defaultMessage: 'Yes, remove'})}
            rightText={formatMessage({defaultMessage: 'Cancel'})}
            onLeftButtonClick={onConfirm}
            onRightButtonClick={onCancel}
            leftButton={StyledLeftButton}
            rightButton={StyledRightButton}
            onCloseButtonClick={onCancel}
        />
    );
};

const StyledIcon = styled(CompassIcon)`
    font-size: 12px;
`;

const StyledLeftButton = styled(DefaultLeftButton)`
    color: var(--button-color);
    background: var(--dnd-indicator);

    &:hover {
        background: rgba(var(--dnd-indicator-rgb), 0.9);
    }
`;

const StyledRightButton = styled(DefaultRightButton)`
    color: var(--button-bg);
    background: rgba(var(--button-bg-rgb), 0.08);

    &:hover {
        background: rgba(var(--button-bg-rgb), 0.04);
    }
`;
