// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {connect} from 'react-redux';
import {callsEnabledInCurrentChannel} from 'src/selectors';

import ChannelHeaderMenuButton from './component';

const mapStateToProps = (state: GlobalState) => ({
    enabled: callsEnabledInCurrentChannel(state),
});

export default connect(mapStateToProps)(ChannelHeaderMenuButton);
