// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package interfaces

import (
	"net/http"

	"github.com/mattermost/rtcd/service/rtc"
)

type Metrics interface {
	RTCMetrics() rtc.Metrics
	Handler() http.Handler
	IncWebSocketEvent(direction, evType string)
	IncWebSocketConn()
	DecWebSocketConn()
	IncClusterEvent(evType string)
	IncStoreOp(op string)
	ObserveClusterMutexGrabTime(group string, elapsed float64)
	ObserveClusterMutexLockedTime(group string, elapsed float64)
	IncClusterMutexLockRetries(group string)
}
