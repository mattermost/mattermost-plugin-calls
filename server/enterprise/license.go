// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package enterprise

import (
	"github.com/mattermost/mattermost-plugin-calls/server/license"

	"github.com/mattermost/mattermost/server/public/model"
)

type LicensePluginAPI interface {
	GetLicense() *model.License
	GetConfig() *model.Config
}

type LicenseChecker struct {
	api LicensePluginAPI
}

func NewLicenseChecker(api LicensePluginAPI) *LicenseChecker {
	return &LicenseChecker{
		api,
	}
}

// isAtLeastE20Licensed returns true when the server either has at least an E20 license or is configured for development.
func (e *LicenseChecker) isAtLeastE20Licensed() bool {
	return license.IsE20LicensedOrDevelopment(e.api.GetConfig(), e.api.GetLicense())
}

// isAtLeastE10Licensed returns true when the server either has at least an E10 license or is configured for development.
func (e *LicenseChecker) isAtLeastE10Licensed() bool {
	return license.IsE10LicensedOrDevelopment(e.api.GetConfig(), e.api.GetLicense())
}

// RTCDAllowed returns true if the license allows use of an external rtcd service.
func (e *LicenseChecker) RTCDAllowed() bool {
	return e.isAtLeastE20Licensed() || license.IsCloud(e.api.GetLicense())
}

// RecordingsAllowed returns true if the license allows use of
// the call recordings functionality.
func (e *LicenseChecker) RecordingsAllowed() bool {
	return e.isAtLeastE20Licensed()
}

// RecordingsAllowed returns true if the license allows use of
// the call transcriptions functionality.
func (e *LicenseChecker) TranscriptionsAllowed() bool {
	return e.isAtLeastE20Licensed()
}

func (e *LicenseChecker) HostControlsAllowed() bool {
	return e.isAtLeastE10Licensed()
}
