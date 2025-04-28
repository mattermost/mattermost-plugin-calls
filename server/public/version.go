// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package public

type VersionInfo struct {
	Version     string `json:"version"`
	Build       string `json:"build"`
	RTCDVersion string `json:"rtcd_version,omitempty"`
	RTCDBuild   string `json:"rtcd_build,omitempty"`
}
