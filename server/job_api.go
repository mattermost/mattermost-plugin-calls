// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"net/http"
	"regexp"

	"github.com/mattermost/mattermost/server/public/model"
)

var jobsRE = regexp.MustCompile(`^\/jobs\/([a-z0-9]+)$`)
var jobsLogsRE = regexp.MustCompile(`^\/jobs\/([a-z0-9]+)/logs$`)

func (p *Plugin) handleGetJob(w http.ResponseWriter, r *http.Request, jobID string) {
	userID := r.Header.Get("Mattermost-User-Id")
	isAdmin := p.API.HasPermissionTo(userID, model.PermissionManageSystem)

	if !isAdmin {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if p.jobService == nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	job, err := p.jobService.GetJob(jobID)
	if err != nil {
		p.LogError("failed to get job", "err", err.Error(), "jobID", jobID)
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(job); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleGetJobLogs(w http.ResponseWriter, r *http.Request, jobID string) {
	userID := r.Header.Get("Mattermost-User-Id")
	isAdmin := p.API.HasPermissionTo(userID, model.PermissionManageSystem)

	if !isAdmin {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if p.jobService == nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	data, err := p.jobService.GetJobLogs(jobID)
	if err != nil {
		p.LogError("failed to get job logs", "err", err.Error(), "jobID", jobID)
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	if _, err := w.Write(data); err != nil {
		p.LogError(err.Error())
	}
}
