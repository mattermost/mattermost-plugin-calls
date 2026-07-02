// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState as MattermostStore} from '@mattermost/types/store';
import {pluginId} from 'src/manifest';
import {emptyRootReducer, RootReducer} from 'src/reducers';

const PLUGIN_REDUX_STATE_KEY = `plugins-${pluginId}`;

// The plugin attaches its store to the Mattermost global store
// via the PLUGIN_REDUX_STATE_KEY at root level.
type State = MattermostStore & Record<typeof PLUGIN_REDUX_STATE_KEY, RootReducer>;

// Although this selector reads from `State`, callers receive the Mattermost
// global store type, which does not declare plugin reducer keys.
export const getPluginStore = (state: MattermostStore): State[typeof PLUGIN_REDUX_STATE_KEY] =>
    (state as State)[PLUGIN_REDUX_STATE_KEY] ?? emptyRootReducer;
