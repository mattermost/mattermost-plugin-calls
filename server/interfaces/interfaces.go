// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package interfaces

import (
	"database/sql"
	"net/http"
)

type Metrics interface {
	Handler() http.Handler
	IncWebSocketEvent(direction, evType string)
	IncWebSocketConn()
	DecWebSocketConn()
	IncStoreOp(op string)
	ObserveClusterMutexGrabTime(group string, elapsed float64)
	ObserveClusterMutexLockedTime(group string, elapsed float64)
	IncClusterMutexLockRetries(group string)
	ObserveLiveCaptionsAudioLen(elapsed float64)
	IncLiveCaptionsWindowDropped()
	IncLiveCaptionsTranscriberBufFull()
	IncLiveCaptionsPktPayloadChBufFull()
	ObserveAppHandlersTime(handler string, elapsed float64)
	ObserveStoreMethodsTime(method string, elapsed float64)
	RegisterDBMetrics(db *sql.DB, name string)
}

type StoreMetrics interface {
	IncStoreOp(op string)
	ObserveStoreMethodsTime(method string, elapsed float64)
}
