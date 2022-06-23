// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useRef, useState} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {components, ControlProps} from 'react-select';
import styled, {css} from 'styled-components';
import {DateObjectUnits, DateTime, Duration, DurationLikeObject} from 'luxon';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import DateTimeSelector, {DateTimeOption, optionFromMillis} from '../datetime_selector';
import {labelFrom, Mode, ms, Option, useMakeOption} from '../datetime_input';
import {Timestamp} from 'src/webapp_globals';

import {OVERLAY_DELAY} from 'src/constants';

import ChecklistHoverMenuButton from './hover_button';

interface Props {
    date?: number;
    mode: Mode.DateTimeValue | Mode.DurationValue;
    editable?: boolean;
    disableDueDateEdit?: boolean;

    onSelectedChange: (value?: DateTimeOption | undefined | null) => void;
}

const controlComponentDueDate = (isDateTime: boolean) => (ownProps: ControlProps<DateTimeOption, boolean>) => (
    <div>
        <components.Control {...ownProps}/>
        {ownProps.selectProps.showCustomReset && (
            <ControlComponentAnchor onClick={ownProps.selectProps.onCustomReset}>
                {isDateTime ? <FormattedMessage defaultMessage='No due date'/> : <FormattedMessage defaultMessage='No time frame'/>}
            </ControlComponentAnchor>
        )}
    </div>
);

const PastTimeSpec = [
    {within: ['second', -45], display: <FormattedMessage defaultMessage='just now'/>},
    ['minute', -59],
    ['hour', -12],
    ['day', -30],
    ['month', -12],
    'year',
];

const FutureTimeSpec = [
    ['minute', 59],
    ['hour', 12],
    ['day', 30],
    ['month', 12],
    'year',
];

export const DueDateHoverMenuButton = ({
    date,
    mode,
    ...props
}: Props) => {
    const {formatMessage} = useIntl();
    const dueDateEditAvailable = !props.disableDueDateEdit;
    const makeOption = useMakeOption(Mode.DurationValue);

    let suggestedOptions = [];
    if (mode === Mode.DurationValue) {
        suggestedOptions = makeDefaultDurationOptions(makeOption, date);
    } else {
        suggestedOptions = makeDefaultDateTimeOptions();
        if (date) {
            suggestedOptions.push(selectedValueOption(date, mode));
        }
    }

    const licenseControl = (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
        if (!dueDateEditAvailable) {
            e.stopPropagation();
        }
    };
    const [dateTimeSelectorToggle, setDateTimeSelectorToggle] = useState(false);
    const resetDueDate = () => {
        props.onSelectedChange();
        setDateTimeSelectorToggle(!dateTimeSelectorToggle);
    };

    const hoverMenuButton = (
        <ChecklistHoverMenuButton
            disabled={!dueDateEditAvailable}
            title={dueDateEditAvailable ? formatMessage({defaultMessage: 'Add due date'}) : ''}
            className={'icon-calendar-outline icon-12 btn-icon'}
            onClick={licenseControl}
        />
    );

    const toolTip = formatMessage({defaultMessage: 'Due date (Available in the Professional plan)'});

    // if feature is not available display license info on hover
    const placeholder = dueDateEditAvailable ? (
        hoverMenuButton
    ) : (
        <OverlayTrigger
            placement='top'
            delay={OVERLAY_DELAY}
            shouldUpdatePosition={true}
            overlay={<Tooltip id='due-date-tooltip'>{toolTip}</Tooltip>}
        >
            {hoverMenuButton}
        </OverlayTrigger>
    );

    return (
        <DateTimeSelector
            date={date}
            mode={mode}
            onlyPlaceholder={true}
            placeholder={placeholder}
            suggestedOptions={suggestedOptions}
            onSelectedChange={props.onSelectedChange}
            customControl={controlComponentDueDate(mode === Mode.DateTimeValue)}
            customControlProps={{
                showCustomReset: Boolean(date),
                onCustomReset: resetDueDate,
            }}
            controlledOpenToggle={dateTimeSelectorToggle}
            showOnRight={true}
        />
    );
};

export const DueDateButton = ({
    date,
    mode,
    ...props
}: Props) => {
    const {formatMessage} = useIntl();
    const dueDateEditAvailable = !props.disableDueDateEdit;
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [showOnRight, setShowOnRight] = useState(false);
    const ref = useRef<any>(null);

    useEffect(() => {
        // depending on component left offset decide where to show popup
        setShowOnRight(ref.current.offsetLeft > 50);
    }, [props.editable]);

    const makeOption = useMakeOption(Mode.DurationValue);

    let suggestedOptions = [];
    if (mode === Mode.DurationValue) {
        suggestedOptions = makeDefaultDurationOptions(makeOption, date);
    } else {
        suggestedOptions = makeDefaultDateTimeOptions();
        if (date) {
            suggestedOptions.push(selectedValueOption(date, mode));
        }
    }

    const handleButtonClick = (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
        if (!props.editable) {
            e.stopPropagation();
            return;
        }

        if (!dueDateEditAvailable) {
            e.stopPropagation();
            setShowUpgradeModal(true);
        }
    };

    const [dateTimeSelectorToggle, setDateTimeSelectorToggle] = useState(false);
    const resetDueDate = () => {
        props.onSelectedChange();
        setDateTimeSelectorToggle(!dateTimeSelectorToggle);
    };

    const dueSoon = mode === Mode.DateTimeValue && isDueSoon(date);
    const overdue = mode === Mode.DateTimeValue && isOverdue(date);
    const label = mode === Mode.DateTimeValue ? buttonLabelForDateTime(date) : buttonLabelForDuration(date);

    const dueDateButton = (
        <DueDateContainer
            ref={ref}
            overdue={overdue}
            dueSoon={dueSoon}
        >
            <DateTimeSelector
                placeholder={
                    <PlaceholderDiv
                        onClick={handleButtonClick}
                        data-testid='due-date-info-button'
                    >
                        <CalendarIcon
                            className={'icon-calendar-outline icon-12 btn-icon'}
                            overdueOrDueSoon={overdue || dueSoon}
                        />
                        <DueDateTextContainer overdue={overdue}>
                            {label}
                        </DueDateTextContainer>
                        {props.editable && (
                            <SelectorRightIcon
                                className='icon-chevron-down icon-12'
                                overdueOrDueSoon={overdue || dueSoon}
                            />)
                        }
                    </PlaceholderDiv>
                }

                date={date}
                mode={mode}
                onlyPlaceholder={true}
                suggestedOptions={suggestedOptions}
                onSelectedChange={props.onSelectedChange}
                customControl={controlComponentDueDate(mode === Mode.DateTimeValue)}
                customControlProps={{
                    showCustomReset: Boolean(date),
                    onCustomReset: resetDueDate,
                }}
                controlledOpenToggle={dateTimeSelectorToggle}
                showOnRight={showOnRight}
            />
        </DueDateContainer>
    );

    const dateInfo = date ? DateTime.fromMillis(date).toLocaleString({month: 'short', day: '2-digit'}) : '';
    const toolTip = formatMessage({defaultMessage: 'Due on {date}'}, {date: dateInfo});

    return (
        (date && mode === Mode.DateTimeValue && !props.editable) ? (
            <OverlayTrigger
                placement='bottom'
                delay={OVERLAY_DELAY}
                shouldUpdatePosition={true}
                overlay={<Tooltip id='due-date-tooltip'>{toolTip}</Tooltip>}
            >
                {dueDateButton}
            </OverlayTrigger>
        ) : dueDateButton
    );
};

const buttonLabelForDuration = (date?: number) => {
    if (!date) {
        return <FormattedMessage defaultMessage='Add time frame'/>;
    }
    return labelFrom(Duration.fromMillis(date));
};

const buttonLabelForDateTime = (date?: number) => {
    if (!date) {
        return <FormattedMessage defaultMessage='Add due date'/>;
    }

    const timespec = (date < DateTime.now().toMillis()) ? PastTimeSpec : FutureTimeSpec;
    const timestamp = DateTime.fromMillis(date);
    return (
        <>
            {<FormattedMessage defaultMessage='Due'/>}
            {' '}
            <Timestamp
                value={timestamp.toJSDate()}
                units={timespec}
                useTime={false}
            />
        </>
    );
};

const makeDefaultDateTimeOptions = () => {
    let dateTime = DateTime.now();
    dateTime = dateTime.endOf('day');

    const list: DateTimeOption[] = [];
    list.push(
        {
            ...optionFromMillis(dateTime.toMillis(), Mode.DateTimeValue),
            label: <FormattedMessage defaultMessage='Today'/>,
            labelRHS: (<LabelRight>{dateTime.weekdayShort}</LabelRight>),
        },
    );

    dateTime = dateTime.plus({days: 1});
    list.push(
        {
            ...optionFromMillis(dateTime.toMillis(), Mode.DateTimeValue),
            label: <FormattedMessage defaultMessage='Tomorrow'/>,
            labelRHS: (<LabelRight>{dateTime.weekdayShort}</LabelRight>),
        },
    );

    // plus only 6 because earlier we did plus 1
    dateTime = dateTime.plus({days: 6});
    list.push(
        {
            ...optionFromMillis(dateTime.toMillis(), Mode.DateTimeValue),
            label: <FormattedMessage defaultMessage='Next week'/>,
            labelRHS: (<LabelRight>{dateTime.toLocaleString({weekday: 'short', day: '2-digit', month: 'short'})}</LabelRight>),
        },
    );
    return list;
};

const makeDefaultDurationOptions = (makeOption: (input: string | DateObjectUnits | DurationLikeObject, label?: string) => Option, date: number | undefined) => {
    const options = [
        makeOption({hours: 4}),
        makeOption({days: 1}),
        makeOption({days: 7}),
    ] as DateTimeOption[];

    let value: DateTimeOption | undefined;
    if (date) {
        value = makeOption({milliseconds: date});
        value.labelRHS = (<CheckIcon className={'icon icon-check'}/>);

        const index = options.findIndex((o) => value && ms(o.value) === ms(value.value));
        if (index === -1) {
            options.push(value);
        } else {
            options[index].labelRHS = (<CheckIcon className={'icon icon-check'}/>);
        }
        options.sort((a, b) => ms(a.value) - ms(b.value));
    }
    return options;
};

const selectedValueOption = (value: number, mode: Mode.DateTimeValue | Mode.DurationValue) => ({
    ...optionFromMillis(value, mode),
    labelRHS: (<CheckIcon className={'icon icon-check'}/>),
});

const isOverdue = (date?: number) => {
    if (!date) {
        return false;
    }

    return date < DateTime.now().toMillis();
};

// if it is due in 12 hours
const isDueSoon = (date?: number) => {
    if (!date) {
        return false;
    }
    const dueDate = DateTime.fromMillis(date);
    const now = DateTime.now();
    const diff = dueDate.diff(now, ['hours']).hours;

    return diff <= 12 && diff > 0;
};

const ControlComponentAnchor = styled.a`
    display: inline-block;
    margin: 0 0 8px 12px;
    font-weight: 600;
    font-size: 12px;
    position: relative;
    top: -4px;
`;

const LabelRight = styled.div`
    font-weight: 400;
    font-size: 12px;
    line-height: 16px;
    color: rgba(var(--center-channel-color-rgb), 0.56);
`;

const CheckIcon = styled.i`
    color: var(--button-bg);
	font-size: 22px;
`;

const PlaceholderDiv = styled.div`
    display: flex;
    align-items: center;
    flex-direction: row;
    white-space: nowrap;

    &:hover {
        cursor: pointer;
    }
`;

const DueDateTextContainer = styled.div<{overdue: boolean}>`
    font-size: 12px;
    line-height: 15px;

    font-weight:  ${(props) => (props.overdue ? '600' : '400')};
`;

const CalendarIcon = styled.div<{overdueOrDueSoon: boolean}>`
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    text-align: center;
    flex: table;
    margin-right: 5px;
    color: inherit;
    pointer-events: none;

    ${({overdueOrDueSoon}) => !overdueOrDueSoon && `
        color: rgba(var(--center-channel-color-rgb), 0.56);
    `}
`;

const SelectorRightIcon = styled.i<{overdueOrDueSoon: boolean}>`
    font-size: 14px;
    &{
        margin-left: 4px;
    }

    ${({overdueOrDueSoon}) => !overdueOrDueSoon && `
        color: var(--center-channel-color-32);
    `}
`;

const DueDateContainer = styled.div<{overdue: boolean, dueSoon: boolean}>`
    display: flex;
    flex-wrap: wrap;

    border-radius: 13px;
    padding: 2px 8px;
    background: rgba(var(--center-channel-color-rgb), 0.08);
    max-width: 100%;

    ${({overdue, dueSoon}) => (overdue || dueSoon ? css`
        background-color: rgba(var(--dnd-indicator-rgb), 0.08);
        color: var(--dnd-indicator);
    ` : css`
        background-color: rgba(var(--center-channel-color-rgb), 0.08);
        color: var(--center-channel-color);
    `)}

    :hover {
        background: rgba(var(--center-channel-color-rgb), 0.16);
    }
`;
