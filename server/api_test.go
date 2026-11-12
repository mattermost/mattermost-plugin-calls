// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"crypto/fips140"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestHandleGetVersion(t *testing.T) {
	p := &Plugin{}

	w := httptest.NewRecorder()
	p.handleGetVersion(w, httptest.NewRequest(http.MethodGet, "/version", nil))

	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "application/json", w.Header().Get("Content-Type"))

	var info map[string]any
	require.NoError(t, json.NewDecoder(w.Body).Decode(&info))
	require.Equal(t, map[string]any{
		"version": manifest.Version,
		"build":   buildHash,
		"fips":    fips140.Enabled(),
	}, info)
}
