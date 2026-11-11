// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

//go:build !linux || !cgo

package fipsdiag

func OpenSSLReport() string {
	return "OpenSSL report needs linux and cgo"
}
