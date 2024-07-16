import React from 'react';
import {useIntl} from 'react-intl';

export default function ICEAndTURNSection(props: {settingsList: React.ReactNode[]}) {
    const {formatMessage} = useIntl();

    return (
        <div className='config-section'>
            <div className='admin-console__wrapper'>
                <div className='admin-console__content'>
                    <div className='section-header'>
                        <div className='section-title'>
                            {formatMessage({defaultMessage: 'ICE and TURN'})}
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
