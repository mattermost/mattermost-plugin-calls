// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

// Calls v2 uses its own tables, separate from v1's (calls, calls_channels,
// calls_sessions, calls_jobs), so the two versions never share schema.
const (
	tableCalls        = "calls_v2_calls"
	tableChannels     = "calls_v2_channels"
	tableSessions     = "calls_v2_sessions"
	tableJobs         = "calls_v2_jobs"
	tableParticipants = "calls_v2_participants"
	tableScreenShares = "calls_v2_screen_shares"
)
