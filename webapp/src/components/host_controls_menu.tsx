import React from 'react';
import {useIntl} from 'react-intl';
import {makeHost} from 'src/actions';
import {DropdownMenuItem} from 'src/components/dot_menu/dot_menu';
import {StyledMonitorAccount} from 'src/components/expanded_view/styled_components';

type Props = {
    callID?: string;
    userID?: string;
}

export const HostControlsMenu = ({callID, userID}: Props) => {
    const {formatMessage} = useIntl();

    if (!callID || !userID) {
        return null;
    }

    // TODO: don't show 'make host' for host; keeping for now bc we will show other menu items next
    return (
        <DropdownMenuItem onClick={() => makeHost(callID, userID)}>
            <StyledMonitorAccount/>
            {formatMessage({defaultMessage: 'Make host'})}
        </DropdownMenuItem>
    );
};
