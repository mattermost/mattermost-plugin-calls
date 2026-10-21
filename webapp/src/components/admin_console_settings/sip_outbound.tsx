// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import RestClient from 'src/clients/rest';
import {
    LabelRow,
    leftCol,
    RadioInput,
    RadioInputLabel,
    rightCol,
    SectionTitle,
} from 'src/components/admin_console_settings/common';
import {SIPTrunkMode, SIPTrunkModeContext} from 'src/components/admin_console_settings/sip_trunk_mode_context';
import {callsConfigEnvOverrides} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';
import {getPluginPath} from 'src/utils';

const E164 = /^\+[1-9][0-9]{6,14}$/;

// The admin console's plugin settings have no conditional display, and a custom
// setting only sees its own pending value. This section holds the selected mode in
// context so sibling settings can show or hide themselves on an unsaved change.
export function SIPOutboundSection(props: {settingsList: React.ReactNode[]}) {
    const {formatMessage} = useIntl();
    const [mode, setMode] = useState<SIPTrunkMode>('existing');

    return (
        <SIPTrunkModeContext.Provider value={{mode, setMode}}>
            <div
                className='config-section'
                data-testid={'calls-sip-outbound-section'}
            >
                <div className='admin-console__wrapper'>
                    <div className='admin-console__content'>
                        <div className='section-header'>
                            <SectionTitle className='section-title'>
                                {formatMessage({defaultMessage: 'Outbound phone calls'})}
                            </SectionTitle>
                            <div className='section-subtitle'>
                                {formatMessage({defaultMessage: 'Let users dial external phone numbers through a LiveKit SIP bridge'})}
                            </div>
                        </div>
                        <div className='section-body'>
                            {props.settingsList}
                        </div>
                    </div>
                </div>
            </div>
        </SIPTrunkModeContext.Provider>
    );
}

export function SIPTrunkModeSetting(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    const {setMode} = useContext(SIPTrunkModeContext);
    const overrides = useSelector(callsConfigEnvOverrides);
    const disabled = props.disabled || 'SIPTrunkMode' in overrides;
    const value: SIPTrunkMode = props.value === 'managed' ? 'managed' : 'existing';

    // Seed the section from the saved/pending value before first paint.
    useLayoutEffect(() => {
        setMode(value);
    }, [setMode, value]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const next = e.target.value as SIPTrunkMode;
        props.onChange(props.id, next);
        setMode(next);
    };

    return (
        <div
            data-testid={props.id}
            className='form-group'
        >
            <label className={'control-label ' + leftCol}>
                {formatMessage({defaultMessage: 'SIP outbound trunk'})}
            </label>
            <div className={rightCol}>
                <RadioInputLabel $disabled={disabled}>
                    <RadioInput
                        data-testid={props.id + 'existing'}
                        type='radio'
                        value='existing'
                        name={props.id}
                        checked={value === 'existing'}
                        onChange={handleChange}
                        disabled={disabled}
                    />
                    {formatMessage({defaultMessage: 'Use an existing trunk ID'})}
                </RadioInputLabel>
                <RadioInputLabel $disabled={disabled}>
                    <RadioInput
                        data-testid={props.id + 'managed'}
                        type='radio'
                        value='managed'
                        name={props.id}
                        checked={value === 'managed'}
                        onChange={handleChange}
                        disabled={disabled}
                    />
                    {formatMessage({defaultMessage: 'Let Calls manage the trunk'})}
                </RadioInputLabel>
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: 'LiveKit Cloud creates the trunk in its dashboard: paste its ID. With a self-hosted LiveKit server, Calls can create and update the trunk for you.'})}
                </div>
            </div>
        </div>
    );
}

type TrunkFieldProps = CustomComponentProps & {
    settingKey: string;
    label: string;
    help?: string;
    shownIn: SIPTrunkMode;
    inputType?: string;
    placeholder?: string;
    validate?: (value: string) => string | null;
};

function TrunkField(props: TrunkFieldProps) {
    const {formatMessage} = useIntl();
    const {mode} = useContext(SIPTrunkModeContext);
    const overrides = useSelector(callsConfigEnvOverrides);

    if (mode !== props.shownIn) {
        return null;
    }

    const overridden = props.settingKey in overrides;
    const disabled = props.disabled || overridden;
    const value = props.value ?? '';
    const error = props.validate ? props.validate(value) : null;

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, e.target.value);
    };

    const className = disabled ? 'form-control disabled' : 'form-control';

    return (
        <div
            data-testid={props.id}
            className='form-group'
        >
            <div className={'control-label ' + leftCol}>
                <LabelRow>
                    <label
                        data-testid={props.id + 'label'}
                        htmlFor={props.id}
                    >
                        {props.label}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <input
                    data-testid={props.id + 'input'}
                    id={props.id}
                    className={className}
                    type={props.inputType ?? 'text'}
                    value={value}
                    placeholder={props.placeholder}
                    autoComplete={props.inputType === 'password' ? 'new-password' : 'off'}
                    onChange={handleChange}
                    disabled={disabled}
                />
                {props.help &&
                    <div
                        data-testid={props.id + 'help-text'}
                        className='help-text'
                    >
                        {props.help}
                    </div>
                }
                {error &&
                    <div
                        data-testid={props.id + 'error'}
                        className='help-text error-text'
                    >
                        {error}
                    </div>
                }
                {overridden &&
                    <div className='alert alert-warning'>
                        {formatMessage({defaultMessage: 'This setting has been set through an environment variable. It cannot be changed through the System Console.'})}
                    </div>
                }
            </div>
        </div>
    );
}

export function SIPTrunkAddress(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    return (
        <TrunkField
            {...props}
            settingKey='SIPTrunkAddress'
            shownIn='managed'
            label={formatMessage({defaultMessage: 'Trunk address'})}
            help={formatMessage({defaultMessage: 'Host the SIP bridge sends calls to (e.g. example.pstn.twilio.com). No "sip:" prefix. It must be reachable from the bridge.'})}
            validate={(v) => {
                if (v.trim() === '') {
                    return formatMessage({defaultMessage: 'A trunk address is required.'});
                }
                if (v.includes('://') || v.trim().startsWith('sip:')) {
                    return formatMessage({defaultMessage: 'Enter a hostname only, without a protocol or "sip:" prefix.'});
                }
                return null;
            }}
        />
    );
}

export function SIPTrunkNumber(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    return (
        <TrunkField
            {...props}
            settingKey='SIPTrunkNumber'
            shownIn='managed'
            placeholder='+15551234567'
            label={formatMessage({defaultMessage: 'Caller ID number'})}
            help={formatMessage({defaultMessage: 'The number calls are placed from, in E.164 format (e.g. +15551234567). It must be attached to the trunk at your SIP provider, or the provider will reject calls.'})}
            validate={(v) => {
                const n = v.trim();
                if (n === '') {
                    return formatMessage({defaultMessage: 'A caller ID number is required.'});
                }
                return E164.test(n) ? null : formatMessage({defaultMessage: 'Enter one number in E.164 format (e.g. +15551234567).'});
            }}
        />
    );
}

export function SIPTrunkAuthUsername(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    return (
        <TrunkField
            {...props}
            settingKey='SIPTrunkAuthUsername'
            shownIn='managed'
            label={formatMessage({defaultMessage: 'Auth username'})}
            help={formatMessage({defaultMessage: 'Username used to authenticate with the SIP provider. Leave empty for no authentication.'})}
        />
    );
}

export function SIPTrunkAuthPassword(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    return (
        <TrunkField
            {...props}
            settingKey='SIPTrunkAuthPassword'
            shownIn='managed'
            inputType='password'
            label={formatMessage({defaultMessage: 'Auth password'})}
            help={formatMessage({defaultMessage: 'Password used to authenticate with the SIP provider.'})}
        />
    );
}

type TrunkSelectProps = CustomComponentProps & {
    settingKey: string;
    label: string;
    help: string;
    options: Array<{value: string; label: string}>;
    defaultValue: string;
};

function TrunkSelect(props: TrunkSelectProps) {
    const {formatMessage} = useIntl();
    const {mode} = useContext(SIPTrunkModeContext);
    const overrides = useSelector(callsConfigEnvOverrides);

    if (mode !== 'managed') {
        return null;
    }

    const overridden = props.settingKey in overrides;
    const disabled = props.disabled || overridden;
    const value = props.value || props.defaultValue;

    const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
        props.onChange(props.id, e.target.value);
    };

    return (
        <div
            data-testid={props.id}
            className='form-group'
        >
            <div className={'control-label ' + leftCol}>
                <LabelRow>
                    <label
                        data-testid={props.id + 'label'}
                        htmlFor={props.id}
                    >
                        {props.label}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <select
                    data-testid={props.id + 'dropdown'}
                    className={disabled ? 'form-control disabled' : 'form-control'}
                    id={props.id}
                    value={value}
                    onChange={handleChange}
                    disabled={disabled}
                >
                    {props.options.map((o) => (
                        <option
                            key={o.value}
                            value={o.value}
                        >
                            {o.label}
                        </option>
                    ))}
                </select>
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {props.help}
                </div>
                {overridden &&
                    <div className='alert alert-warning'>
                        {formatMessage({defaultMessage: 'This setting has been set through an environment variable. It cannot be changed through the System Console.'})}
                    </div>
                }
            </div>
        </div>
    );
}

export function SIPTrunkTransport(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    return (
        <TrunkSelect
            {...props}
            settingKey='SIPTrunkTransport'
            defaultValue='auto'
            label={formatMessage({defaultMessage: 'SIP transport'})}
            help={formatMessage({defaultMessage: 'Transport used for SIP signaling to the provider. Auto lets LiveKit choose. Select TLS if your provider requires encrypted signaling, and TCP if large SIP messages are being dropped over UDP.'})}
            options={[
                {value: 'auto', label: formatMessage({defaultMessage: 'Auto'})},
                {value: 'udp', label: formatMessage({defaultMessage: 'UDP'})},
                {value: 'tcp', label: formatMessage({defaultMessage: 'TCP'})},
                {value: 'tls', label: formatMessage({defaultMessage: 'TLS'})},
            ]}
        />
    );
}

export function SIPTrunkMediaEncryption(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    return (
        <TrunkSelect
            {...props}
            settingKey='SIPTrunkMediaEncryption'
            defaultValue='disable'
            label={formatMessage({defaultMessage: 'Media encryption'})}
            help={formatMessage({defaultMessage: 'SRTP encryption for call media. Allow negotiates encryption when the provider offers it and sends media unencrypted otherwise; Require fails the call instead. Providers that require TLS signaling usually require encrypted media too.'})}
            options={[
                {value: 'disable', label: formatMessage({defaultMessage: 'Disabled'})},
                {value: 'allow', label: formatMessage({defaultMessage: 'Allow'})},
                {value: 'require', label: formatMessage({defaultMessage: 'Require'})},
            ]}
        />
    );
}

// The trunk ID is only edited in "existing" mode. It keeps its config key so
// current configurations and env overrides keep working.
export function SIPTrunkID(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    return (
        <TrunkField
            {...props}
            settingKey='LiveKitSIPOutboundTrunkID'
            shownIn='existing'
            label={formatMessage({defaultMessage: 'SIP outbound trunk ID'})}
            help={formatMessage({defaultMessage: 'LiveKit outbound SIP trunk ID (e.g., ST_xxx), created in the LiveKit Cloud dashboard or with the LiveKit CLI. Leave empty to disable outbound dialing.'})}
        />
    );
}

type TrunkStatus = {
    mode: string;
    trunkID: string;
    state: string;
    lastReconciled?: number;
    error?: string;
};

export function SIPTrunkStatusSetting(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    const {mode} = useContext(SIPTrunkModeContext);
    const [status, setStatus] = useState<TrunkStatus | null>(null);
    const [failed, setFailed] = useState(false);
    const mounted = useRef(true);

    const refresh = useCallback(async () => {
        try {
            const res = await RestClient.fetch<TrunkStatus>(`${getPluginPath()}/sip/trunk-status`, {method: 'get'});
            if (mounted.current) {
                setStatus(res);
                setFailed(false);
            }
        } catch {
            if (mounted.current) {
                setFailed(true);
            }
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        refresh();
        return () => {
            mounted.current = false;
        };
    }, [refresh]);

    // The server reconciles asynchronously after a save, so look again shortly after.
    useEffect(() => {
        const action = async () => {
            setTimeout(refresh, 2000);
            return {};
        };
        props.registerSaveAction(action);
        return () => props.unRegisterSaveAction(action);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refresh]);

    // The saved status doesn't describe an unsaved mode change.
    const stale = status !== null && status.mode !== mode;

    let text = formatMessage({defaultMessage: 'Loading…'});
    if (failed) {
        text = formatMessage({defaultMessage: 'Unable to load trunk status.'});
    } else if (status && stale) {
        text = formatMessage({defaultMessage: 'Save to apply the new trunk mode.'});
    } else if (status) {
        text = describeStatus(status, formatMessage);
    }

    const isError = !stale && (failed || status?.state === 'error' || status?.state === 'not_found');

    return (
        <div
            data-testid={props.id}
            className='form-group'
        >
            <label className={'control-label ' + leftCol}>
                {formatMessage({defaultMessage: 'SIP outbound trunk status'})}
            </label>
            <div className={rightCol}>
                <div
                    data-testid={props.id + 'text'}
                    className={isError ? 'help-text error-text' : 'help-text'}
                >
                    {text}
                </div>
            </div>
        </div>
    );
}

function describeStatus(s: TrunkStatus, formatMessage: ReturnType<typeof useIntl>['formatMessage']): string {
    const when = s.lastReconciled ? new Date(s.lastReconciled).toLocaleTimeString() : '';
    switch (s.state) {
    case 'ready':
        return formatMessage({defaultMessage: 'Trunk {id} ready, reconciled {time}'}, {id: s.trunkID, time: when});
    case 'pending':
        return formatMessage({defaultMessage: 'Waiting for the first reconcile…'});
    case 'found':
        return formatMessage({defaultMessage: 'Trunk {id} found on this LiveKit server.'}, {id: s.trunkID});
    case 'not_found':
        return formatMessage({defaultMessage: 'Trunk {id} not found on this LiveKit server.'}, {id: s.trunkID});
    case 'not_configured':
        return s.error || formatMessage({defaultMessage: 'No trunk configured.'});
    default:
        return formatMessage(
            {defaultMessage: 'Reconcile failed: {error}'},
            {error: s.error || formatMessage({defaultMessage: 'unknown error'})},
        );
    }
}
