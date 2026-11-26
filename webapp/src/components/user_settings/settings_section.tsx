// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './settings_section.scss';

import classNames from 'classnames';
import React, {useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';

// Returns focus to the section's Edit button once it closes, as the host's own sections do.
export function useSettingsSection() {
    const [active, setActive] = useState(false);
    const [focusEdit, setFocusEdit] = useState(false);

    return {
        active,
        focusEdit,
        open: () => setActive(true),
        close: () => {
            setFocusEdit(true);
            setActive(false);
        },
    };
}

type CollapsedProps = {
    id: string;
    title: string;
    description: string;
    focusEdit: boolean;
    onEdit: () => void;
};

export function SettingsSectionCollapsed({id, title, description, focusEdit, onEdit}: CollapsedProps) {
    const {formatMessage} = useIntl();
    const editRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (focusEdit) {
            editRef.current?.focus();
        }
    }, [focusEdit]);

    return (
        <div
            className='section-min'
            onClick={onEdit}
        >
            <div className='section-min__header'>
                <h4
                    id={`${id}Title`}
                    className='section-min__title'
                >
                    {title}
                </h4>
                <button
                    ref={editRef}
                    id={`${id}Edit`}
                    type='button'
                    className='color--link style--none section-min__edit'
                    aria-labelledby={`${id}Title ${id}Edit`}
                    aria-expanded={false}
                >
                    <i
                        className='icon-pencil-outline'
                        aria-hidden='true'
                    />
                    <span>{formatMessage({defaultMessage: 'Edit'})}</span>
                </button>
            </div>
            <div className='section-min__describe'>
                {description}
            </div>
        </div>
    );
}

type ExpandedProps = {
    id: string;
    title: string;
    isFullWidth?: boolean;
    className?: string;
    onSave: () => void;
    onCancel: () => void;
    children: React.ReactNode;
};

export function SettingsSectionExpanded({id, title, isFullWidth = false, className, onSave, onCancel, children}: ExpandedProps) {
    const {formatMessage} = useIntl();

    return (
        <section className={classNames('section-max form-horizontal CallsSettingsSection', className)}>
            <h4
                id={`${id}SectionTitle`}
                className='col-sm-12 section-title'
            >
                {title}
            </h4>
            <div
                className={classNames('sectionContent', {
                    'col-sm-12': isFullWidth,
                    'col-sm-10 col-sm-offset-2': !isFullWidth,
                })}
            >
                <div
                    tabIndex={-1}
                    className='setting-list'
                >
                    <div className='setting-list-item'>
                        {children}
                    </div>
                    <div className='setting-list-item'>
                        <hr/>
                        <button
                            type='submit'
                            className='btn btn-primary'
                            onClick={onSave}
                        >
                            {formatMessage({defaultMessage: 'Save'})}
                        </button>
                        <button
                            type='button'
                            className='btn btn-tertiary'
                            onClick={onCancel}
                        >
                            {formatMessage({defaultMessage: 'Cancel'})}
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}

type FieldProps = {
    label: string;
    labelId: string;
    htmlFor?: string;
    alignTop?: boolean;
    children: React.ReactNode;
};

export function SettingsField({label, labelId, htmlFor, alignTop = false, children}: FieldProps) {
    return (
        <div className={classNames('CallsSettingsSection__field', {'CallsSettingsSection__field--top': alignTop})}>
            {htmlFor ? (
                <label
                    id={labelId}
                    htmlFor={htmlFor}
                    className='CallsSettingsSection__label'
                >
                    {label}
                </label>
            ) : (
                <span
                    id={labelId}
                    className='CallsSettingsSection__label'
                >
                    {label}
                </span>
            )}
            <div className='CallsSettingsSection__control'>
                {children}
            </div>
        </div>
    );
}
