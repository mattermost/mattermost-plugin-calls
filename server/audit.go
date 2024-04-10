// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// httpResponse holds data returned to API clients.
// JSON fields are overridden to be compliant with what MM server would return.
type httpResponse struct {
	Msg  string `json:"message,omitempty"`
	Err  string `json:"detailed_error,omitempty"`
	Code int    `json:"status_code"`
}

func (r httpResponse) isEmpty() bool {
	return r == httpResponse{}
}

func (p *Plugin) httpResponseHandler(res *httpResponse, w http.ResponseWriter) {
	if res.Err != "" && res.Msg == "" {
		res.Msg = res.Err
		res.Err = ""
	}
	if !res.isEmpty() {
		if res.Code != 0 {
			w.WriteHeader(res.Code)
		}
		if res.Code != http.StatusNoContent {
			w.Header().Add("Content-Type", "application/json")
			if err := json.NewEncoder(w).Encode(res); err != nil {
				p.LogError(fmt.Sprintf("failed to encode data: %s", err))
			}
		}
	}
}

func (p *Plugin) httpAudit(handler string, res *httpResponse, w http.ResponseWriter, r *http.Request) {
	logFields := reqAuditFields(r)
	if res.Err != "" {
		logFields = append(logFields, "error", res.Err, "code", res.Code, "status", "fail")
	} else {
		logFields = append(logFields, "code", res.Code, "status", "success")
	}

	p.httpResponseHandler(res, w)

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
