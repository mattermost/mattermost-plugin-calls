// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"net/http"
)

type httpResponse struct {
	err  string
	code int
}

func (p *Plugin) httpAudit(handler string, res httpResponse, w http.ResponseWriter, r *http.Request) {
	logFields := reqAuditFields(r)
	if res.err != "" {
		http.Error(w, res.err, res.code)
		logFields = append(logFields, "error", res.err, "code", res.code, "status", "fail")
	} else {
		logFields = append(logFields, "status", "success")
	}
	p.LogDebug(handler, logFields...)
}

func reqAuditFields(req *http.Request) []interface{} {
	fields := []interface{}{
		"remoteAddr", req.RemoteAddr,
		"method", req.Method,
		"url", req.URL.String(),
		"header", fmt.Sprintf("%+v", req.Header),
		"host", req.Host,
	}
	return fields
}
