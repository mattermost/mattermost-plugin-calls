import {connect} from 'react-redux';

import {voiceConnectedProfiles, voiceUsersStatuses} from 'selectors';

import RHSView from './component';

const mapStateToProps = (state) => ({
    profiles: voiceConnectedProfiles(state) || [],
    statuses: voiceUsersStatuses(state) || {},
});

export default connect(mapStateToProps)(RHSView);
