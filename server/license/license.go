// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package license

import (
	"github.com/mattermost/mattermost/server/public/model"
)

const (
	professional       = "professional"
	enterprise         = "enterprise"
	enterpriseAdvanced = "advanced"
)

// IsEnterpriseLicensedOrDevelopment returns true when the server is licensed with any Mattermost
// Enterprise License, or has `EnableDeveloper` and `EnableTesting` configuration settings
// enabled signaling a non-production, developer mode.
func IsEnterpriseLicensedOrDevelopment(config *model.Config, license *model.License) bool {
	if license != nil {
		return true
	}

	return IsConfiguredForDevelopment(config)
}

// isValidSkuShortName returns whether the SKU short name is one of the known strings;
// namely: professional, enterprise or enterprise advanced.
func isValidSkuShortName(license *model.License) bool {
	if license == nil {
		return false
	}

	switch license.SkuShortName {
	case professional, enterprise, enterpriseAdvanced:
		return true
	default:
		return false
	}
}

// IsMinimumProfessionalLicensedOrDevelopment returns true when the server is at least licensed with
// a Mattermost Professional License, or has `EnableDeveloper` and
// `EnableTesting` configuration settings enabled, signaling a non-production, developer mode.
func IsMinimumProfessionalLicensedOrDevelopment(config *model.Config, license *model.License) bool {
	if IsProfessional(license) || IsEnterprise(license) || IsEnterpriseAdvanced(license) {
		return true
	}

	if !isValidSkuShortName(license) {
		// As a fallback for licenses whose SKU short name is unknown, make a best effort to try
		// and use the presence of a known E10/Professional feature as a check to determine licensing.
		if license != nil &&
			license.Features != nil &&
			license.Features.LDAP != nil &&
			*license.Features.LDAP {
			return true
		}
	}

	return IsConfiguredForDevelopment(config)
}

// IsMinimumEnterpriseLicensedOrDevelopment returns true when the server is at least licensed with
// a Mattermost Enterprise License, or has `EnableDeveloper` and
// `EnableTesting` configuration settings enabled, signaling a non-production, developer mode.
func IsMinimumEnterpriseLicensedOrDevelopment(config *model.Config, license *model.License) bool {
	if IsEnterprise(license) || IsEnterpriseAdvanced(license) {
		return true
	}

	if !isValidSkuShortName(license) {
		// As a fallback for licenses whose SKU short name is unknown, make a best effort to try
		// and use the presence of a known E20/Enterprise feature as a check to determine licensing.
		if license != nil &&
			license.Features != nil &&
			license.Features.FutureFeatures != nil &&
			*license.Features.FutureFeatures {
			return true
		}
	}

	return IsConfiguredForDevelopment(config)
}

// IsConfiguredForDevelopment returns true when the server has `EnableDeveloper` and `EnableTesting`
// configuration settings enabled, signaling a non-production, developer mode.
func IsConfiguredForDevelopment(config *model.Config) bool {
	if config != nil &&
		config.ServiceSettings.EnableTesting != nil &&
		*config.ServiceSettings.EnableTesting &&
		config.ServiceSettings.EnableDeveloper != nil &&
		*config.ServiceSettings.EnableDeveloper {
		return true
	}

	return false
}

// IsCloud returns true when the server is on cloud, and false otherwise.
func IsCloud(license *model.License) bool {
	if license == nil || license.Features == nil || license.Features.Cloud == nil {
		return false
	}

	return *license.Features.Cloud
}

func IsCloudStarter(license *model.License) bool {
	return license != nil && license.SkuShortName == "starter"
}

func IsEnterprise(license *model.License) bool {
	if license != nil && (license.SkuShortName == enterprise) {
		return true
	}

	return false
}

func IsProfessional(license *model.License) bool {
	if license != nil && (license.SkuShortName == professional) {
		return true
	}

	return false
}

func IsEnterpriseAdvanced(license *model.License) bool {
	if license != nil && (license.SkuShortName == enterpriseAdvanced) {
		return true
	}

	return false
}
