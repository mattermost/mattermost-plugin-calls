// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/gorilla/mux"
)

func (p *Plugin) newAPIRouter() *mux.Router {
	router := mux.NewRouter()

	// Public API endpoints (no auth required)

	versionRoute := router.HandleFunc("/version", p.handleGetVersion).Methods("GET")
	var metricsRoute *mux.Route
	if p.metrics != nil {
		metricsRoute = router.Handle("/metrics", p.metrics.Handler()).Methods("GET")
	}

	// Authenticated API handlers (user session required)

	// Auth middleware
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if versionRoute.Match(r, &mux.RouteMatch{}) {
				next.ServeHTTP(w, r)
				return
			}

			if metricsRoute != nil && metricsRoute.Match(r, &mux.RouteMatch{}) {
				next.ServeHTTP(w, r)
				return
			}

			if userID := r.Header.Get("Mattermost-User-Id"); userID != "" {
				next.ServeHTTP(w, r)
				return
			}

			http.Error(w, "Unauthorized", http.StatusUnauthorized)
		})
	})

	// Config
	router.HandleFunc("/config", func(w http.ResponseWriter, r *http.Request) {
		if err := p.handleConfig(w, r); err != nil {
			p.handleError(w, err)
		}
	}).Methods("GET")

	// Config environment overrides
	router.HandleFunc("/env", func(w http.ResponseWriter, r *http.Request) {
		if err := p.handleEnv(w, r); err != nil {
			p.handleError(w, err)
		}
	}).Methods("GET")

	// CallsChannels (keep for backward compatibility)
	router.HandleFunc("/{channel_id:[a-z0-9]{26}}", p.handleGetCallChannelState).Methods("GET")
	router.HandleFunc("/{channel_id:[a-z0-9]{26}}", p.handlePostCallsChannel).Methods("POST")
	router.HandleFunc("/channels", p.handleGetAllCallChannelStates).Methods("GET")

	// Calls
	router.HandleFunc("/calls/{channel_id:[a-z0-9]{26}}/dismiss-notification", p.handleDismissNotification).Methods("POST")
	router.HandleFunc("/calls/{channel_id:[a-z0-9]{26}}/active", p.handleGetCallActive).Methods("GET")
	router.HandleFunc("/calls/{call_id:[a-z0-9]{26}}/end", p.handleEnd).Methods("POST")

	// LiveKit token endpoint
	router.HandleFunc("/livekit-token", p.handleGetLiveKitToken).Methods("GET")

	// Guest links
	router.HandleFunc("/guest-links", p.handleCreateGuestLink).Methods("POST")
	router.HandleFunc("/guest-links/{channel_id:[a-z0-9]{26}}", p.handleGetGuestLinks).Methods("GET")
	router.HandleFunc("/guest-links/{link_id:[a-z0-9]{26}}", p.handleRevokeGuestLink).Methods("DELETE")

	// Stats
	router.HandleFunc("/stats", func(w http.ResponseWriter, r *http.Request) {
		if userID := r.Header.Get("Mattermost-User-Id"); !p.API.HasPermissionTo(userID, model.PermissionManageSystem) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		if err := p.handleGetStats(w); err != nil {
			p.handleError(w, err)
		}
	}).Methods("GET")

	// Rate limiting middleware
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if userID := r.Header.Get("Mattermost-User-Id"); userID != "" {
				if err := p.checkAPIRateLimits(userID); err != nil {
					http.Error(w, err.Error(), http.StatusTooManyRequests)
					return
				}
			}

			next.ServeHTTP(w, r)
		})
	})

	return router
}
