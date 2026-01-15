// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import ReactSelect from 'react-select';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {getMyPreferences} from 'mattermost-redux/selectors/entities/preferences';
import {savePreferences} from 'mattermost-redux/actions/preferences';
import {PreferenceType} from '@mattermost/types/preferences';
import {PREFERENCE_CATEGORY_CALLS, PREFERENCE_NAME_CAPTION_LANGUAGE, CAPTION_LANGUAGES, CaptionLanguageOption} from 'src/constants';
import {loadCallsUserPreferences} from 'src/actions';
import {liveCaptionsEnabled, liveCaptionsLanguage} from 'src/selectors';
import {logErr} from 'src/log';
import styled from 'styled-components';
import {GlobalState} from '@mattermost/types/store';
import translationService from 'src/translation_service';
import {filterAvailableCaptionLanguages} from 'src/utils';

export default function CaptionLanguageSettingsSection() {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();
    const currentUserId = useSelector(getCurrentUserId);
    const preferences = useSelector((state: GlobalState) => getMyPreferences(state));
    const liveCaptionsOn = useSelector(liveCaptionsEnabled);
    const sourceLanguage = useSelector(liveCaptionsLanguage);
    
    const [active, setActive] = useState(false);
    const [selectedOption, setSelectedOption] = useState<CaptionLanguageOption>(CAPTION_LANGUAGES[0]);
    const [saving, setSaving] = useState(false);
    const [browserSupported, setBrowserSupported] = useState<boolean | null>(null);
    const [filteredLanguages, setFilteredLanguages] = useState<CaptionLanguageOption[]>([]);

    const title = formatMessage({defaultMessage: 'Live captions language'});
    const description = formatMessage({defaultMessage: 'Select a language to automatically translate live captions when live captions are enabled.'});
    const editLabel = formatMessage({defaultMessage: 'Edit'});

    const loadCurrentPreference = () => {
        try {
            const prefKey = `${PREFERENCE_CATEGORY_CALLS}--${PREFERENCE_NAME_CAPTION_LANGUAGE}`;
            const captionLangPref = preferences[prefKey] as PreferenceType | undefined;
            
            console.log('[Calls] Loading caption language preference:', {
                prefKey,
                preference: captionLangPref,
                value: captionLangPref?.value,
            });

            if (captionLangPref && captionLangPref.value) {
                // Try to find in filtered languages first, then fall back to all languages
                const languagesToSearch = filteredLanguages.length > 0 ? filteredLanguages : CAPTION_LANGUAGES;
                const option = languagesToSearch.find((lang) => lang.value === captionLangPref.value);
                if (option) {
                    console.log('[Calls] Found matching language option:', option);
                    setSelectedOption(option);
                } else {
                    // If saved value isn't in our list, still set it (in case list changes)
                    console.log('[Calls] Saved value not in list, using as-is:', captionLangPref.value);
                    setSelectedOption({label: captionLangPref.value, value: captionLangPref.value});
                }
            } else {
                // No preference set, use default (no translation)
                console.log('[Calls] No preference set, using default');
                setSelectedOption(CAPTION_LANGUAGES[0]);
            }
        } catch (err) {
            logErr('failed to load caption language preference', err);
            console.error('[Calls] Error loading caption language preference:', err);
        }
    };

    // Check if browser supports translation and filter languages on mount and when source language changes
    useEffect(() => {
        const loadLanguages = async () => {
            const supported = await translationService.isSupported();
            setBrowserSupported(supported);

            if (supported) {
                const filtered = await filterAvailableCaptionLanguages(
                    sourceLanguage,
                    CAPTION_LANGUAGES,
                    translationService,
                );
                setFilteredLanguages(filtered);
            }
        };

        loadLanguages();
    }, [sourceLanguage]);

    // Load preference from Mattermost preferences on mount and when preferences or filtered languages change
    useEffect(() => {
        loadCurrentPreference();
    }, [preferences, filteredLanguages]);

    // Reload preference when opening the settings panel
    useEffect(() => {
        if (active) {
            loadCurrentPreference();
        }
    }, [active]);

    // Don't render if live captions are not enabled in plugin config
    if (!liveCaptionsOn) {
        return null;
    }

    // Don't render if browser doesn't support translation API
    if (browserSupported === false) {
        return null;
    }

    // Don't render yet if we're still checking browser support
    if (browserSupported === null) {
        return null;
    }

    const handleSave = async () => {
        setSaving(true);
        try {
            console.log('[Calls] Saving caption language preference:', selectedOption.value);
            
            // Save preference to Mattermost
            await dispatch(savePreferences(currentUserId, [
                {
                    user_id: currentUserId,
                    category: PREFERENCE_CATEGORY_CALLS,
                    name: PREFERENCE_NAME_CAPTION_LANGUAGE,
                    value: selectedOption.value,
                },
            ]));

            console.log('[Calls] Caption language preference saved, reloading preferences...');

            // Reload plugin user preferences to update Redux state
            dispatch(loadCallsUserPreferences());

            setActive(false);
        } catch (err) {
            logErr('failed to save caption language preference', err);
            console.error('[Calls] Failed to save caption language preference:', err);
        } finally {
            setSaving(false);
        }
    };

    if (!active) {
        const languagesToSearch = filteredLanguages.length > 0 ? filteredLanguages : CAPTION_LANGUAGES;
        const currentSelection = languagesToSearch.find((lang) => lang.value === selectedOption.value) || CAPTION_LANGUAGES[0];
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
                    <span>{currentSelection.label}</span>
                </div>
            </div>
        );
    }

    return (
        <section className='section-max form-horizontal'>
            <h4 className='col-sm-12 section-title'>
                <span>{title}</span>
            </h4>
            <div className='sectionContent col-sm-10 col-sm-offset-2'>
                <div
                    tabIndex={-1}
                    className='setting-list'
                >
                    <div className='setting-list-item'>
                        <Fieldset>
                            <SelectionWrapper>
                                <SelectLabel
                                    id='captionLanguageLabel'
                                    htmlFor='captionLanguageSelect'
                                >
                                    {formatMessage({defaultMessage: 'Translation language'})}
                                </SelectLabel>
                                <StyledReactSelect
                                    inputId='captionLanguageSelect'
                                    aria-labelledby='captionLanguageLabel'
                                    className='react-select singleSelect'
                                    classNamePrefix='react-select'
                                    options={filteredLanguages.length > 0 ? filteredLanguages : CAPTION_LANGUAGES}
                                    clearable={false}
                                    isClearable={false}
                                    isSearchable={true}
                                    components={{IndicatorSeparator: () => null}}
                                    value={selectedOption}
                                    onChange={(opt: CaptionLanguageOption | null) => opt && setSelectedOption(opt)}
                                />
                            </SelectionWrapper>
                            <Description>{description}</Description>
                        </Fieldset>
                    </div>
                    <div className='setting-list-item'>
                        <hr/>
                        <button
                            type='submit'
                            className='btn btn-primary'
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {formatMessage({defaultMessage: 'Save'})}
                        </button>
                        <button
                            className='btn btn-tertiary'
                            onClick={() => setActive(false)}
                            disabled={saving}
                        >
                            {formatMessage({defaultMessage: 'Cancel'})}
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}

const StyledReactSelect = styled(ReactSelect)`
  width: 260px;
`;

const SelectionWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const SelectLabel = styled.label`
  font-size: 14px;
  font-weight: 400;
  line-height: 20px;
  margin: 0;
`;

const Description = styled.span`
  margin-top: 8px;
  font-size: 12px;
  color: rgba(var(--center-channel-color-rgb), 0.72);
`;

const Fieldset = styled.fieldset`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

