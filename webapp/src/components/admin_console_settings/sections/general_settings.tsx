import React from 'react';
import {FormattedMessage, useIntl} from 'react-intl';

export default function GeneralSettingsSection(props: {settingsList: React.ReactNode[]}) {
    const {formatMessage} = useIntl();

    return (
        <div
            className='config-section'
            data-testid={'calls-general-settings-section'}
        >
            <div className='admin-console__wrapper'>
                <div className='admin-console__content'>
                    <div className='section-header'>
                        <div className='section-title'>
                            {formatMessage({defaultMessage: 'General settings'})}
                        </div>
                        <div className='section-subtitle'>
                            {formatMessage({defaultMessage: 'Settings for participants, screen sharing, ringing and more'})}
                        </div>
                    </div>
                    <div className='section-body'>
                        {props.settingsList}
                    </div>
                </div>
            </div>
        </div>
    );
}
