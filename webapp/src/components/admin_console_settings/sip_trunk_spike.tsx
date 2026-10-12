// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// MM-71127 SPIKE: throwaway prototype to verify that a custom section can show/hide
// sibling custom settings based on an unsaved selection. Not wired to any server behavior.

import React, {ChangeEvent, createContext, useContext, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    LabelRow,
    leftCol,
    RadioInput,
    RadioInputLabel,
    rightCol,
    SectionTitle,
} from 'src/components/admin_console_settings/common';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

type Mode = 'existing' | 'managed';

type ModeContextValue = {
    mode: Mode | null; // null = outside the section, show everything
    setMode: (mode: Mode) => void;
};

const ModeContext = createContext<ModeContextValue>({mode: null, setMode: () => undefined});

export function SIPTrunkSpikeSection(props: {settingsList: React.ReactNode[]}) {
    const {formatMessage} = useIntl();
    const [mode, setMode] = useState<Mode>('existing');

    return (
        <ModeContext.Provider value={{mode, setMode}}>
            <div
                className='config-section'
                data-testid={'calls-sip-trunk-spike-section'}
            >
                <div className='admin-console__wrapper'>
                    <div className='admin-console__content'>
                        <div className='section-header'>
                            <SectionTitle className='section-title'>
                                {formatMessage({defaultMessage: 'SIP Trunk (spike)'})}
                            </SectionTitle>
                            <div className='section-subtitle'>
                                {formatMessage({defaultMessage: 'Prototype of conditional settings. Does nothing.'})}
                            </div>
                        </div>
                        <div className='section-body'>
                            {props.settingsList}
                        </div>
                    </div>
                </div>
            </div>
        </ModeContext.Provider>
    );
}

export function SIPTrunkMode(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    const {setMode} = useContext(ModeContext);
    const value: Mode = props.value === 'managed' ? 'managed' : 'existing';

    // Seed the section from the saved/pending value on mount.
    useEffect(() => {
        setMode(value);
    }, [setMode, value]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const next = e.target.value as Mode;
        props.onChange(props.id, next);
        setMode(next);
    };

    return (
        <div
            data-testid={props.id}
            className='form-group'
        >
            <label className={'control-label ' + leftCol}>
                {formatMessage({defaultMessage: 'SIP trunk mode'})}
            </label>
            <div className={rightCol}>
                <RadioInputLabel $disabled={props.disabled}>
                    <RadioInput
                        data-testid={props.id + 'existing'}
                        type='radio'
                        value='existing'
                        name={props.id}
                        checked={value === 'existing'}
                        onChange={handleChange}
                        disabled={props.disabled}
                    />
                    {formatMessage({defaultMessage: 'Existing trunk ID'})}
                </RadioInputLabel>
                <RadioInputLabel $disabled={props.disabled}>
                    <RadioInput
                        data-testid={props.id + 'managed'}
                        type='radio'
                        value='managed'
                        name={props.id}
                        checked={value === 'managed'}
                        onChange={handleChange}
                        disabled={props.disabled}
                    />
                    {formatMessage({defaultMessage: 'Let Calls manage the trunk'})}
                </RadioInputLabel>
            </div>
        </div>
    );
}

function TrunkTextField(props: CustomComponentProps & {label: string, shownIn: Mode, type?: string}) {
    const {mode} = useContext(ModeContext);
    if (mode !== null && mode !== props.shownIn) {
        return null;
    }

    return (
        <div
            data-testid={props.id}
            className='form-group'
        >
            <div className={'control-label ' + leftCol}>
                <LabelRow>
                    <label htmlFor={props.id}>{props.label}</label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <input
                    id={props.id}
                    className='form-control'
                    type={props.type ?? 'text'}
                    value={props.value ?? ''}
                    onChange={(e) => props.onChange(props.id, e.target.value)}
                    disabled={props.disabled}
                />
            </div>
        </div>
    );
}

export function SIPTrunkSpikeID(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    return (
        <TrunkTextField
            {...props}
            label={formatMessage({defaultMessage: 'SIP Outbound Trunk ID'})}
            shownIn='existing'
        />
    );
}

export function SIPTrunkAddress(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    return (
        <TrunkTextField
            {...props}
            label={formatMessage({defaultMessage: 'Trunk address'})}
            shownIn='managed'
        />
    );
}

export function SIPTrunkNumbers(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    return (
        <TrunkTextField
            {...props}
            label={formatMessage({defaultMessage: 'Caller ID numbers'})}
            shownIn='managed'
        />
    );
}

export function SIPTrunkUsername(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    return (
        <TrunkTextField
            {...props}
            label={formatMessage({defaultMessage: 'Auth username'})}
            shownIn='managed'
        />
    );
}

export function SIPTrunkPassword(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    return (
        <TrunkTextField
            {...props}
            label={formatMessage({defaultMessage: 'Auth password'})}
            shownIn='managed'
            type='password'
        />
    );
}

export function SIPTrunkStatus(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    const {mode} = useContext(ModeContext);
    if (mode !== null && mode !== 'managed') {
        return null;
    }

    return (
        <div
            data-testid={props.id}
            className='form-group'
        >
            <label className={'control-label ' + leftCol}>
                {formatMessage({defaultMessage: 'Trunk status'})}
            </label>
            <div className={rightCol}>
                <div className='help-text'>
                    {formatMessage({defaultMessage: 'Trunk ST_dummy123 ready (placeholder status)'})}
                </div>
            </div>
        </div>
    );
}
