// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import {useIntl} from 'react-intl';
import {hostLowerHand, hostMake, hostMute, hostScreenOff} from 'src/actions';
import {DropdownMenuItem, DropdownMenuSeparator} from 'src/components/dot_menu/dot_menu';
import MinusCircleOutlineIcon from 'src/components/icons/minus_circle_outline';
import MonitorAccount from 'src/components/icons/monitor_account';
import MutedIcon from 'src/components/icons/muted_icon';
import ShowMoreIcon from 'src/components/icons/show_more';
import TranslateIcon from 'src/components/icons/translate';
import UnraisedHandIcon from 'src/components/icons/unraised_hand';
import UnshareScreenIcon from 'src/components/icons/unshare_screen';
import {untranslatable} from 'src/utils';
import styled from 'styled-components';

type Props = {
    callID?: string;
    userID: string;
    sessionID: string;
    isMuted: boolean;
    isSharingScreen: boolean;
    isHandRaised: boolean;
    isHost: boolean;
    currentTranslation?: string;
    onRemove: () => void;
    onTranslationChange?: (language: string | null) => void;
    isRecording: boolean;
    transcriptionsEnabled: boolean;
    recordingStarted: boolean;
}

const TRANSLATION_LANGUAGES = [
    {code: 'en-US', name: 'English'},
    {code: 'es-ES', name: 'Spanish (Spain)'},
    {code: 'fr-FR', name: 'French'},
    {code: 'it-IT', name: 'Italian'},
    {code: 'ar-SA', name: 'Arabic'},
    {code: 'ja-JP', name: 'Japanese'},
];

export const HostControlsMenu = ({
    callID,
    userID,
    sessionID,
    isMuted,
    isSharingScreen,
    isHandRaised,
    isHost,
    currentTranslation,
    onRemove,
    onTranslationChange,
    isRecording,
    transcriptionsEnabled,
    recordingStarted,
}: Props) => {
    const {formatMessage} = useIntl();
    const [showTranslationMenu, setShowTranslationMenu] = useState(false);

    if (!callID) {
        return null;
    }

    const muteUnmute = isMuted ? null : (
        <DropdownMenuItem onClick={() => hostMute(callID, sessionID)}>
            <MutedIcon
                data-testid={'host-mute'}
                fill='var(--center-channel-color-56)'
                style={{width: '16px', height: '16px'}}
            />
            {formatMessage({defaultMessage: 'Mute participant'})}
        </DropdownMenuItem>
    );

    const handleTranslationSelect = (languageCode: string | null) => {
        if (onTranslationChange) {
            onTranslationChange(languageCode);
        }
        setShowTranslationMenu(false);
    };

    const renderTranslationMenu = () => {
        return (
            <>
                <DropdownMenuItem
                    onClick={() => handleTranslationSelect(null)}
                    data-testid={'translation-off'}
                >
                    <TranslationOption $isSelected={!currentTranslation}>
                        {formatMessage({defaultMessage: 'Turn off translation'})}
                        {!currentTranslation && <CheckMark>{untranslatable('✓')}</CheckMark>}
                    </TranslationOption>
                </DropdownMenuItem>
                <DropdownMenuSeparator/>
                {TRANSLATION_LANGUAGES.map((language) => (
                    <DropdownMenuItem
                        key={language.code}
                        onClick={() => handleTranslationSelect(language.code)}
                        data-testid={`translation-${language.code}`}
                    >
                        <TranslationOption $isSelected={currentTranslation === language.code}>
                            {language.name}
                            {currentTranslation === language.code && <CheckMark>{untranslatable('✓')}</CheckMark>}
                        </TranslationOption>
                    </DropdownMenuItem>
                ))}
            </>
        );
    };

    const translationAvailable = isRecording && transcriptionsEnabled && recordingStarted;
    const showingAtLeastOne = !isMuted || isSharingScreen || isHandRaised || !isHost || translationAvailable;

    return (
        <>
            {muteUnmute}
            {isSharingScreen &&
                <DropdownMenuItem onClick={() => hostScreenOff(callID, sessionID)}>
                    <UnshareScreenIcon
                        fill='var(--center-channel-color-56)'
                        style={{width: '16px', height: '16px'}}
                    />
                    {formatMessage({defaultMessage: 'Stop screen share'})}
                </DropdownMenuItem>
            }
            {isHandRaised &&
                <DropdownMenuItem onClick={() => hostLowerHand(callID, sessionID)}>
                    <UnraisedHandIcon
                        fill='var(--center-channel-color-56)'
                        style={{width: '16px', height: '16px'}}
                    />
                    {formatMessage({defaultMessage: 'Lower hand'})}
                </DropdownMenuItem>
            }
            {!isHost &&
                <DropdownMenuItem onClick={() => hostMake(callID, userID)}>
                    <MonitorAccount
                        fill='var(--center-channel-color-56)'
                        style={{width: '16px', height: '16px'}}
                    />
                    {formatMessage({defaultMessage: 'Make host'})}
                </DropdownMenuItem>
            }
            {translationAvailable &&
                <>
                    <DropdownMenuItem
                        onClick={() => {
                            setShowTranslationMenu(!showTranslationMenu);
                        }}
                        data-testid={'translation-menu-toggle'}
                    >
                        <TranslateIcon
                            fill='var(--center-channel-color-56)'
                            style={{width: '16px', height: '16px'}}
                        />
                        {formatMessage({defaultMessage: 'Translate to'})}
                        <ExpandArrow $isExpanded={showTranslationMenu}>
                            <ShowMoreIcon
                                fill='var(--center-channel-color-56)'
                                style={{width: '16px', height: '16px'}}
                            />
                        </ExpandArrow>
                    </DropdownMenuItem>
                    {showTranslationMenu && renderTranslationMenu()}
                </>
            }
            {showingAtLeastOne &&
                <DropdownMenuSeparator/>
            }
            <DropdownMenuItem onClick={onRemove}>
                <MinusCircleOutlineIcon
                    fill='var(--dnd-indicator)'
                    style={{width: '16px', height: '16px'}}
                />
                <RedText>{formatMessage({defaultMessage: 'Remove from call'})}</RedText>
            </DropdownMenuItem>
        </>
    );
};

const RedText = styled.span`
    color: var(--dnd-indicator);
`;

const TranslationOption = styled.div<{$isSelected: boolean}>`
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    font-weight: ${({$isSelected}) => $isSelected ? '600' : '400'};
    padding-left: 24px;
`;

const CheckMark = styled.span`
    color: var(--button-bg);
    font-weight: 600;
    margin-left: 8px;
`;

const ExpandArrow = styled.span<{$isExpanded: boolean}>`
    margin-left: auto;
    transform: ${({$isExpanded}) => $isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'};
    transition: transform 0.2s ease;
    display: flex;
    align-items: center;
`;
