// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import {useIntl} from 'react-intl';
import {SettingsSectionCollapsed, SettingsSectionExpanded, useSettingsSection} from 'src/components/user_settings/settings_section';
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
    const {active, focusEdit, open, close} = useSettingsSection();

    const readStoredValue = () => window.localStorage.getItem(storageKey) || defaultValue;

    const [value, setValue] = useState(readStoredValue);

    const onLabel = formatMessage({defaultMessage: 'On'});
    const offLabel = formatMessage({defaultMessage: 'Off'});

    // Re-read on open so a value changed elsewhere (e.g. another window) isn't overwritten.
    const handleOpen = () => {
        setValue(readStoredValue());
        open();
    };

    const handleSave = () => {
        window.localStorage.setItem(storageKey, value);
        close();
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setValue(e.target.value);
    };

    if (!active) {
        return (
            <SettingsSectionCollapsed
                id={inputName}
                title={title}
                description={description}
                focusEdit={focusEdit}
                onEdit={handleOpen}
            />
        );
    }

    return (
        <SettingsSectionExpanded
            id={inputName}
            title={settingTitle}
            onSave={handleSave}
            onCancel={close}
        >
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
        </SettingsSectionExpanded>
    );
}
