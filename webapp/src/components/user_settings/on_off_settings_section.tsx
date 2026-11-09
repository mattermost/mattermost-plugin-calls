// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import {useIntl} from 'react-intl';
import {untranslatable} from 'src/utils';

type OnOffValue = 'on' | 'off';

type Props = {
    title: string;
    description: string;
    settingTitle: string;
    helpText: string;
    storageKey: string;
    defaultValue: OnOffValue;
    inputName: string;
};

// A user settings section with a single on/off choice stored in localStorage.
// The choice is only written on Save; Cancel discards it.
export default function OnOffSettingsSection({
    title,
    description,
    settingTitle,
    helpText,
    storageKey,
    defaultValue,
    inputName,
}: Props) {
    const {formatMessage} = useIntl();

    const readStoredValue = () => window.localStorage.getItem(storageKey) || defaultValue;

    const [active, setActive] = useState(false);
    const [value, setValue] = useState(readStoredValue);

    const editLabel = formatMessage({defaultMessage: 'Edit'});
    const onLabel = formatMessage({defaultMessage: 'On'});
    const offLabel = formatMessage({defaultMessage: 'Off'});

    // Re-read on open so a value changed elsewhere (e.g. another window) isn't overwritten.
    const handleOpen = () => {
        setValue(readStoredValue());
        setActive(true);
    };

    const handleSave = () => {
        window.localStorage.setItem(storageKey, value);
        setActive(false);
    };

    const handleCancel = () => {
        setActive(false);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setValue(e.target.value);
    };

    if (!active) {
        return (
            <div
                className='section-min'
                onClick={handleOpen}
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
            ><span>{settingTitle}</span></h4>
            <div className='sectionContent col-sm-10 col-sm-offset-2'>
                <div
                    tabIndex={-1}
                    className='setting-list'
                >
                    <div className='setting-list-item'>
                        <fieldset>
                            <legend className='form-legend hidden-label'>{untranslatable(inputName)}</legend>
                            <div className='radio'>
                                <label>
                                    <input
                                        type='radio'
                                        name={inputName}
                                        value='on'
                                        onChange={handleChange}
                                        checked={value === 'on'}
                                    />
                                    {onLabel}
                                </label><br/>
                            </div>
                            <div className='radio'>
                                <label>
                                    <input
                                        type='radio'
                                        name={inputName}
                                        value='off'
                                        onChange={handleChange}
                                        checked={value === 'off'}
                                    />
                                    {offLabel}
                                </label><br/>
                            </div>
                            <div className='mt-5'>
                                <p>{helpText}</p>
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
                            onClick={handleCancel}
                        >
                            {formatMessage({defaultMessage: 'Cancel'})}
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
