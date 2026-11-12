// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package license

import (
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/stretchr/testify/require"
)

func TestIsMinimumEnterpriseAdvancedLicensedOrDevelopment(t *testing.T) {
	devConfig := &model.Config{ServiceSettings: model.ServiceSettings{
		EnableDeveloper: model.NewPointer(true),
		EnableTesting:   model.NewPointer(true),
	}}
	partialDevConfig := &model.Config{ServiceSettings: model.ServiceSettings{
		EnableDeveloper: model.NewPointer(true),
	}}
	cloud := func(sku string) *model.License {
		return &model.License{SkuShortName: sku, Features: &model.Features{Cloud: model.NewPointer(true)}}
	}

	tests := []struct {
		name    string
		config  *model.Config
		license *model.License
		want    bool
	}{
		{"nil license", &model.Config{}, nil, false},
		{"nil config and license", nil, nil, false},
		{"professional", &model.Config{}, &model.License{SkuShortName: professional}, false},
		{"enterprise", &model.Config{}, &model.License{SkuShortName: enterprise}, false},
		{"advanced", &model.Config{}, &model.License{SkuShortName: enterpriseAdvanced}, true},
		{"cloud advanced", &model.Config{}, cloud(enterpriseAdvanced), true},
		{"cloud enterprise", &model.Config{}, cloud(enterprise), false},
		{"cloud starter", &model.Config{}, cloud("starter"), false},
		{"unknown sku with future features", &model.Config{}, &model.License{SkuShortName: "other", Features: &model.Features{FutureFeatures: model.NewPointer(true)}}, false},
		{"developer mode without license", devConfig, nil, true},
		{"developer mode with enterprise", devConfig, &model.License{SkuShortName: enterprise}, true},
		{"developer without testing", partialDevConfig, nil, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, IsMinimumEnterpriseAdvancedLicensedOrDevelopment(tt.config, tt.license))
		})
	}
}
