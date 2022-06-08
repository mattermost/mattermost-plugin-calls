// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

func (p *Plugin) handleError(w http.ResponseWriter, internalErr error) {
	p.handleErrorWithCode(w, http.StatusInternalServerError, "An internal error has occurred. Check app server logs for details.", internalErr)
}

// handleErrorWithCode logs the internal error and sends the public facing error
// message as JSON in a response with the provided code.
func (p *Plugin) handleErrorWithCode(w http.ResponseWriter, code int, publicErrorMsg string, internalErr error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)

	details := ""
	if internalErr != nil {
		details = internalErr.Error()
	}

	p.LogError(fmt.Sprintf("public error message: %v; internal details: %v", publicErrorMsg, details))

	responseMsg, _ := json.Marshal(struct {
		Error string `json:"error"` // A public facing message providing details about the error.
	}{
		Error: publicErrorMsg,
	})
	_, _ = w.Write(responseMsg)
}
