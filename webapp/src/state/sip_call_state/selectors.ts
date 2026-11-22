// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {createSelector} from 'reselect';
import {RootState} from 'src/reducers';
import {phoneCallPropsForCurrentCall} from 'src/selectors';
import {channelIDForCurrentCall, pluginReduxStore} from 'src/state/root_selectors';
import {SIPCallState} from 'src/types/types';

const sipCallStatesInPluginReduxStore = (state: GlobalState): RootState['sipCallStates'] =>
    pluginReduxStore(state).sipCallStates;

export const sipCallStateForCallInChannel = (state: GlobalState, channelID: string): SIPCallState | undefined =>
    sipCallStatesInPluginReduxStore(state)[channelID];

export const sipCallStateForCurrentCall: (state: GlobalState) => SIPCallState | undefined =
    createSelector(
        sipCallStatesInPluginReduxStore,
        channelIDForCurrentCall,
        (sipCallStates, channelID) => sipCallStates[channelID],
    );

// True while the phone leg of the current phone call has not been answered yet.
export const isCurrentPhoneCallRinging: (state: GlobalState) => boolean =
    createSelector(
        phoneCallPropsForCurrentCall,
        sipCallStateForCurrentCall,
        (phone, sipState) => Boolean(phone) && !sipState?.answeredAt,
    );

// True while the phone leg of the current phone call is answered and connected.
// Unlike !isCurrentPhoneCallRinging, this turns false again once the phone hangs up.
export const isCurrentPhoneCallActive: (state: GlobalState) => boolean =
    createSelector(
        phoneCallPropsForCurrentCall,
        sipCallStateForCurrentCall,
        (phone, sipState) => Boolean(phone) && sipState?.status === 'active',
    );
