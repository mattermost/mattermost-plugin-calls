package main

import (
	"github.com/gorilla/mux"
	"net/http"
)

func (p *Plugin) handleMakeHost(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleMakeHost", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	callID := mux.Vars(r)["call_id"]
	newHostID := mux.Vars(r)["new_host_id"]

	if err := p.changeHost(userID, callID, newHostID); err != nil {
		p.LogError("handleMakeHost: failed to changeHost", "err", err.Error())
		res.Code = http.StatusInternalServerError
		res.Err = err.Error()
		return
	}

	res.Code = http.StatusOK
	res.Msg = "success"
}
