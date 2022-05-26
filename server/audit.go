package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type httpResponse struct {
	Msg  string `json:"msg,omitempty"`
	Err  string `json:"err,omitempty"`
	Code int    `json:"code"`
}

func (p *Plugin) httpAudit(handler string, res *httpResponse, w http.ResponseWriter, r *http.Request) {
	logFields := reqAuditFields(r)
	if res.Err != "" {
		logFields = append(logFields, "error", res.Err, "code", res.Code, "status", "fail")
	} else {
		logFields = append(logFields, "status", "success")
	}

	w.Header().Add("Content-Type", "application/json")
	w.WriteHeader(res.Code)
	if err := json.NewEncoder(w).Encode(res); err != nil {
		p.LogError(fmt.Sprintf("failed to encode data: %s", err))
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
