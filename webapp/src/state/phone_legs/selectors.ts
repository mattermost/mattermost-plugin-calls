// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {createSelector} from 'reselect';
import {RootState} from 'src/reducers';
import {phoneCallPropsForCurrentCall} from 'src/selectors';
import {channelIDForCurrentCall, pluginReduxStore} from 'src/state/root_selectors';
import {PhoneLeg} from 'src/types/types';

const phoneLegsInPluginReduxStore = (state: GlobalState): RootState['phoneLegs'] =>
    pluginReduxStore(state).phoneLegs;

export const phoneLegForCallInChannel = (state: GlobalState, channelID: string): PhoneLeg | undefined =>
    phoneLegsInPluginReduxStore(state)[channelID];

export const phoneLegForCurrentCall: (state: GlobalState) => PhoneLeg | undefined =
    createSelector(
        phoneLegsInPluginReduxStore,
        channelIDForCurrentCall,
        (phoneLegs, channelID) => phoneLegs[channelID],
    );

// True while the phone leg of the current phone call has not been answered yet.
export const isCurrentPhoneCallRinging: (state: GlobalState) => boolean =
    createSelector(
        phoneCallPropsForCurrentCall,
        phoneLegForCurrentCall,
        (phone, phoneLeg) => Boolean(phone) && !phoneLeg?.answeredAt,
    );

// True while the phone leg of the current phone call is answered and connected.
// Unlike !isCurrentPhoneCallRinging, this turns false again once the phone hangs up.
export const isCurrentPhoneCallActive: (state: GlobalState) => boolean =
    createSelector(
        phoneCallPropsForCurrentCall,
        phoneLegForCurrentCall,
        (phone, phoneLeg) => Boolean(phone) && phoneLeg?.status === 'active',
    );
