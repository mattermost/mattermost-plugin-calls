// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package enterprise

import (
	pluginapi "github.com/mattermost/mattermost-plugin-api"
)

type LicenseChecker struct {
	pluginAPIClient *pluginapi.Client
}

func NewLicenseChecker(pluginAPIClient *pluginapi.Client) *LicenseChecker {
	return &LicenseChecker{
		pluginAPIClient,
	}
}

// isAtLeastE10Licensed returns true when the server either has at least an E10 license or is configured for development.
func (e *LicenseChecker) isAtLeastE10Licensed() bool {
	config := e.pluginAPIClient.Configuration.GetConfig()
	license := e.pluginAPIClient.System.GetLicense()

	return pluginapi.IsE10LicensedOrDevelopment(config, license)
}

// RTCDAllowed returns true if the license allows use of an external rtcd service.
func (e *LicenseChecker) RTCDAllowed() bool {
	license := e.pluginAPIClient.System.GetLicense()

	return e.isAtLeastE10Licensed() || pluginapi.IsCloud(license)
}
