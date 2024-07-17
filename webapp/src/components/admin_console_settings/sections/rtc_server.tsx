import React from 'react';
import {useIntl} from 'react-intl';

export default function RTCServerSection(props: {settingsList: React.ReactNode[]}) {
    const {formatMessage} = useIntl();

    return (
        <div
            className='config-section'
            data-testid={'calls-rtc-server-section'}
        >
            <div className='admin-console__wrapper'>
                <div className='admin-console__content'>
                    <div className='section-header'>
                        <div className='section-title'>
                            {formatMessage({defaultMessage: 'RTC Server'})}
                        </div>
                        <div className='section-subtitle'>
                            {formatMessage({defaultMessage: 'Network configuration for the integrated RTC server'})}
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
