// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package interfaces

import (
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/morph/models"
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
	ObserveLiveCaptionsAudioLen(elapsed float64)
	IncLiveCaptionsWindowDropped()
	IncLiveCaptionsTranscriberBufFull()
	IncLiveCaptionsPktPayloadChBufFull()
}

type StoreMetrics interface {
	IncStoreOp(op string)
}

type Store interface {
	Migrate(direction models.Direction, dryRun bool) error
	Close() error
	GetPost(postID string) (*model.Post, error)
	UpdateFileInfoPostID(fileID, channelID, postID string) error
	KVGet(pluginID, key string, fromWriter bool) ([]byte, error)
}
