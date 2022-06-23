import React from 'react';
import styled from 'styled-components';
import {useIntl} from 'react-intl';
import {UserProfile} from '@mattermost/types/users';

import {ChecklistItemState} from 'src/types/checklist';

import {DotMenuIcon, StyledDotMenuButton, StyledDropdownMenu, StyledDropdownMenuItem, DropdownIcon, StyledDropdownMenuItemRed, DropdownIconRed} from 'src/components/checklist/collapsible_checklist_hover_menu';
import DotMenu from 'src/components/dot_menu';

import {DateTimeOption} from 'src/components/datetime_selector';
import {Mode} from 'src/components/datetime_input';

import ChecklistHoverMenuButton from './hover_button';

import AssignTo from './assign_to';
import {DueDateHoverMenuButton} from './duedate';

export interface Props {
    referenceID?: string;
    renderAssignee?: boolean;
    allowSkipping?: boolean;
    allowDelete?: boolean;
    checklistNum: number;
    itemNum: number;
    isSkipped: boolean;
    isEditing: boolean;
    onEdit: () => void;
    onChange?: (item: ChecklistItemState, referenceID?: string) => void;
    description: string;
    showDescription: boolean;
    toggleDescription: () => void;
    assignee_id: string;
    onAssigneeChange: (userType?: string, user?: UserProfile) => void;
    due_date: number;
    onDueDateChange: (value?: DateTimeOption | undefined | null, referenceID?: string) => void;
    onDuplicateChecklistItem?: (referenceID?: string) => void;
    onDeleteChecklistItem?: (referenceID?: string) => void;
}

const ChecklistItemHoverMenu = (props: Props) => {
    const {formatMessage} = useIntl();
    if (props.isEditing) {
        return null;
    }

    const {referenceID} = props;

    return (
        <HoverMenu>
            {props.description !== '' &&
                <ToggleDescriptionButton
                    title={formatMessage({defaultMessage: 'Toggle description'})}
                    className={'icon icon-chevron-up'}
                    showDescription={props.showDescription}
                    onClick={props.toggleDescription}
                />
            }
            {props.renderAssignee &&
                <AssignTo
                    assignee_id={props.assignee_id}
                    editable={props.isEditing}
                    inHoverMenu={true}
                    onSelectedChange={props.onAssigneeChange}
                />
            }
            <DueDateHoverMenuButton
                date={props.due_date}
                mode={referenceID ? Mode.DateTimeValue : Mode.DurationValue}
                onSelectedChange={(value) => props.onDueDateChange(value, referenceID)}
            />
            <ChecklistHoverMenuButton
                data-testid='hover-menu-edit-button'
                title={formatMessage({defaultMessage: 'Edit'})}
                className={'icon-pencil-outline icon-12 btn-icon'}
                onClick={() => {
                    props.onEdit();
                }}
            />
            <DotMenu
                icon={<DotMenuIcon/>}
                dotMenuButton={DotMenuButton}
                dropdownMenu={StyledDropdownMenu}
                placement='bottom-end'
                title={formatMessage({defaultMessage: 'More'})}
            >
                <StyledDropdownMenuItem
                    onClick={() => {
                        props.onDuplicateChecklistItem?.(referenceID);
                    }}
                >
                    <DropdownIcon className='icon-content-copy icon-16'/>
                    {formatMessage({defaultMessage: 'Duplicate task'})}
                </StyledDropdownMenuItem>
                {props.allowSkipping &&
                    <StyledDropdownMenuItem
                        onClick={() => {
                            if (props.onChange) {
                                if (props.isSkipped) {
                                    props.onChange(ChecklistItemState.Open, referenceID);
                                } else {
                                    props.onChange(ChecklistItemState.Skip, referenceID);
                                }
                            }
                        }}
                    >
                        <DropdownIcon className={props.isSkipped ? 'icon-refresh icon-16 btn-icon' : 'icon-close icon-16 btn-icon'}/>
                        {props.isSkipped ? formatMessage({defaultMessage: 'Restore task'}) : formatMessage({defaultMessage: 'Skip task'})}
                    </StyledDropdownMenuItem>
                }
                {props.allowDelete &&
                    <StyledDropdownMenuItemRed
                        onClick={() => props.onDeleteChecklistItem?.(referenceID)}
                    >
                        <DropdownIconRed className={'icon-close icon-16'}/>
                        {formatMessage({defaultMessage: 'Delete task'})}
                    </StyledDropdownMenuItemRed>
                }
            </DotMenu>
        </HoverMenu>
    );
};

export const HoverMenu = styled.div`
    display: flex;
    align-items: center;
    padding: 0px 3px;
    position: absolute;
    height: 32px;
    right: 1px;
    top: -6px;
    border: 1px solid var(--center-channel-color-08);
    box-shadow: 0px 2px 3px rgba(0, 0, 0, 0.08);
    border-radius: 4px;
    background: var(--center-channel-bg);
`;

const ToggleDescriptionButton = styled(ChecklistHoverMenuButton) <{showDescription: boolean}>`
    padding: 0;
    border-radius: 4px;
    &:before {
        transition: all 0.2s linear;
        transform: ${({showDescription}) => (showDescription ? 'rotate(0deg)' : 'rotate(180deg)')};
    }
`;

const DotMenuButton = styled(StyledDotMenuButton)`
    width: 24px;
    height: 24px;
`;

export default ChecklistItemHoverMenu;
