// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './call_header.scss';

import ArrowCollapseIcon from '@mattermost/compass-icons/components/arrow-collapse';
import CloseIcon from '@mattermost/compass-icons/components/close';
import {Button} from '@mattermost/compass-ui/components/button';
import {Icon} from '@mattermost/compass-ui/components/icon';
import {IconButton} from '@mattermost/compass-ui/components/icon-button';
import classNames from 'classnames';
import React from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import {defineMessage, MessageDescriptor, useIntl} from 'react-intl';
import {CallStatusTimer} from 'src/components/call_status_timer';
import CompassIcon from 'src/components/icons/compassIcon';
import {ExpandedIncomingCallContainer} from 'src/components/incoming_calls/expanded_incoming_call_container';
import {CallAlertType} from 'src/types/types';
import {untranslatable} from 'src/utils';

export type HeaderWarning = {
    id: string;
    tone: CallAlertType;
    icon: string;
    message: React.ReactNode;

    // Omitted for warnings that can't be dismissed.
    onDismiss?: () => void;
};

const TONE_LABELS: Record<CallAlertType, MessageDescriptor> = {
    [CallAlertType.Error]: defineMessage({defaultMessage: 'Error:'}),
    [CallAlertType.Warning]: defineMessage({defaultMessage: 'Warning:'}),
    [CallAlertType.Info]: defineMessage({defaultMessage: 'Info:'}),
};

type Props = {
    title: string;
    clientConnecting: boolean;
    participantCount: number;
    recordingBadge: React.ReactNode;
    isSharing: boolean;
    onStopSharing: () => void;
    onCollapse: () => void;
    warnings: HeaderWarning[];
};

export default function CallHeader({
    title,
    clientConnecting,
    participantCount,
    recordingBadge,
    isSharing,
    onStopSharing,
    onCollapse,
    warnings,
}: Props) {
    const {formatMessage} = useIntl();
    const collapseLabel = formatMessage({defaultMessage: 'Collapse call window'});

    return (
        <header
            className='CallHeader'
            data-testid='calls-expanded-view-top-container'
        >
            <div className='CallHeader__row'>
                <div className='CallHeader__start'>
                    {recordingBadge}
                    <div className='CallHeader__titles'>
                        <h1 className='CallHeader__title'>{title}</h1>
                        <div className='CallHeader__meta'>
                            <CallStatusTimer clientConnecting={clientConnecting}/>
                            <span aria-hidden='true'>{untranslatable('•')}</span>
                            <span>
                                {formatMessage(
                                    {defaultMessage: '{count, plural, one {# participant} other {# participants}}'},
                                    {count: participantCount},
                                )}
                            </span>
                        </div>
                    </div>
                </div>

                <div className='CallHeader__center'>
                    <ExpandedIncomingCallContainer/>
                </div>

                <div className='CallHeader__end'>
                    {isSharing &&
                        <div
                            className='CallHeader__sharePill'
                            data-testid='calls-expanded-view-share-pill'
                        >
                            <span
                                className='CallHeader__liveDot'
                                aria-hidden='true'
                            />
                            <span>{formatMessage({defaultMessage: 'You are sharing your screen'})}</span>
                            <Button
                                id='calls-popout-stop-screenshare'
                                size='x-small'
                                emphasis='tertiary'
                                appearance='inverted'
                                destructive={true}
                                onClick={onStopSharing}
                            >
                                {formatMessage({defaultMessage: 'Stop'})}
                            </Button>
                        </div>
                    }
                    <OverlayTrigger
                        placement='bottom'
                        overlay={<Tooltip id='tooltip-collapse-call-window'>{collapseLabel}</Tooltip>}
                    >
                        <IconButton
                            id='calls-popout-collapse-button'
                            size='small'
                            // eslint-disable-next-line react/style-prop-object
                            style='inverted'
                            icon={<Icon glyph={<ArrowCollapseIcon/>}/>}
                            aria-label={collapseLabel}
                            onClick={onCollapse}
                        />
                    </OverlayTrigger>
                </div>
            </div>

            <div
                className='CallHeader__warnings'
                role='status'
                aria-live='polite'
            >
                {warnings.map((warning) => (
                    <HeaderWarningNotice
                        key={warning.id}
                        warning={warning}
                        toneLabel={formatMessage(TONE_LABELS[warning.tone])}
                        dismissLabel={formatMessage({defaultMessage: 'Dismiss notification:'})}
                    />
                ))}
            </div>
        </header>
    );
}

type HeaderWarningNoticeProps = {
    warning: HeaderWarning;
    toneLabel: string;
    dismissLabel: string;
};

function HeaderWarningNotice({warning, toneLabel, dismissLabel}: HeaderWarningNoticeProps) {
    const className = classNames('CallHeaderWarning', `CallHeaderWarning--${warning.tone}`);
    const content = (
        <>
            <CompassIcon icon={warning.icon}/>
            <span className='CallHeaderWarning__message'>
                <span className='CallHeader__srOnly'>{untranslatable(`${toneLabel} `)}</span>
                {warning.message}
            </span>
        </>
    );

    if (!warning.onDismiss) {
        return (
            <div
                className={className}
                data-testid={`calls-header-warning-${warning.id}`}
            >
                {content}
            </div>
        );
    }

    return (
        <button
            type='button'
            className={className}
            data-testid={`calls-header-warning-${warning.id}`}
            onClick={warning.onDismiss}
        >
            <span className='CallHeader__srOnly'>{untranslatable(`${dismissLabel} `)}</span>
            {content}
            <Icon
                size='16'
                glyph={<CloseIcon/>}
            />
        </button>
    );
}
