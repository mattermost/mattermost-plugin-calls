// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.enterprise for license information.

package enterprise

import (
	"os"

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

// isAtLeastEnterpriseLicensed returns true when the server either has at least an Enterprise license or is configured for development.
func (e *LicenseChecker) isAtLeastEnterpriseLicensed() bool {
	return license.IsMinimumEnterpriseLicensedOrDevelopment(e.api.GetConfig(), e.api.GetLicense())
}

// isAtLeastProfessionalLicensed returns true when the server either has at least a Professional License or is configured for development.
func (e *LicenseChecker) isAtLeastProfessionalLicensed() bool {
	return license.IsProfessionalLicensedOrDevelopment(e.api.GetConfig(), e.api.GetLicense())
}

// RTCDAllowed returns true if the license allows use of an external rtcd service.
func (e *LicenseChecker) RTCDAllowed() bool {
	return e.isAtLeastEnterpriseLicensed() || license.IsCloud(e.api.GetLicense())
}

// RecordingsAllowed returns true if the license allows use of
// the call recordings functionality.
func (e *LicenseChecker) RecordingsAllowed() bool {
	return e.isAtLeastEnterpriseLicensed()
}

// RecordingsAllowed returns true if the license allows use of
// the call transcriptions functionality.
func (e *LicenseChecker) TranscriptionsAllowed() bool {
	return e.isAtLeastEnterpriseLicensed()
}

func (e *LicenseChecker) HostControlsAllowed() bool {
	return e.isAtLeastProfessionalLicensed()
}

func (e *LicenseChecker) GroupCallsAllowed() bool {
	return e.isAtLeastProfessionalLicensed() || os.Getenv("MM_CALLS_GROUP_CALLS_ALLOWED") == "true"
}
