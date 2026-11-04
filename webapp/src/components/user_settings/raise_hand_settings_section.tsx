// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import {useIntl} from 'react-intl';
import {STORAGE_CALLS_LOWER_HAND_ON_UNMUTE} from 'src/constants';
import {untranslatable} from 'src/utils';

export default function RaiseHandSettingsSection() {
    const {formatMessage} = useIntl();
    const [active, setActive] = useState(false);

    const title = formatMessage({defaultMessage: 'Raise hand settings'});
    const description = formatMessage({defaultMessage: 'Configure your raise hand settings.'});
    const editLabel = formatMessage({defaultMessage: 'Edit'});

    const [lowerHand, setLowerHand] = useState(window.localStorage.getItem(STORAGE_CALLS_LOWER_HAND_ON_UNMUTE) || 'off');

    const onLabel = formatMessage({defaultMessage: 'On'});
    const offLabel = formatMessage({defaultMessage: 'Off'});
    const lowerHandSettingTitle = formatMessage({defaultMessage: 'Lower hand when I unmute for more than 3 seconds'});
    const lowerHandSettingHelpText = formatMessage({defaultMessage: 'When enabled, your raised hand will be automatically lowered after you stay unmuted for more than 3 seconds.'});

    const handleSave = () => {
        setActive(false);
    };

    const handleLowerHandChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLowerHand(e.target.value);
        window.localStorage.setItem(STORAGE_CALLS_LOWER_HAND_ON_UNMUTE, e.target.value);
    };

    if (!active) {
        return (
            <div
                className='section-min'
                onClick={() => setActive(!active)}
            >
                <div className='secion-min__header'>
                    <h4 className='section-min__title'>
                        <span>{title}</span>
                    </h4>
                    <button
                        className='color--link style--none section-min__edit'
                        aria-labelledby=''
                        aria-expanded={active}
                    >
                        <i
                            className='icon-pencil-outline'
                            title={editLabel}
                        />
                        <span>{editLabel}</span>
                    </button>
                </div>
                <div className='section-min__describe'>
                    <span>{description}</span>
                </div>
            </div>
        );
    }

    return (
        <section className='section-max form-horizontal'>
            <h4
                id='settingTitle'
                className='col-sm-12 section-title'
            ><span>{lowerHandSettingTitle}</span></h4>
            <div className='sectionContent col-sm-10 col-sm-offset-2'>
                <div
                    tabIndex={-1}
                    className='setting-list'
                >
                    <div className='setting-list-item'>
                        <fieldset>
                            <legend className='form-legend hidden-label'>{untranslatable('lowerHandOnUnmute')}</legend>
                            <div className='radio'>
                                <label>
                                    <input
                                        type='radio'
                                        name='lowerHandOnUnmute'
                                        value='on'
                                        onChange={handleLowerHandChange}
                                        checked={lowerHand === 'on'}
                                    />
                                    {onLabel}
                                </label><br/>
                            </div>
                            <div className='radio'>
                                <label>
                                    <input
                                        type='radio'
                                        name='lowerHandOnUnmute'
                                        value='off'
                                        onChange={handleLowerHandChange}
                                        checked={lowerHand === 'off'}
                                    />
                                    {offLabel}
                                </label><br/>
                            </div>
                            <div className='mt-5'>
                                <p>{lowerHandSettingHelpText}</p>
                            </div>
                        </fieldset>
                    </div>
                    <div className='setting-list-item'>
                        <hr/>
                        <button
                            type='submit'
                            className='btn btn-primary'
                            onClick={handleSave}
                        >
                            {formatMessage({defaultMessage: 'Save'})}
                        </button>
                        <button
                            className='btn btn-tertiary'
                            onClick={() => setActive(false)}
                        >
                            {formatMessage({defaultMessage: 'Cancel'})}
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
