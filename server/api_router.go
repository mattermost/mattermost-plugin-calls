package main

import (
	"net/http"
	"net/http/pprof"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/gorilla/mux"
	godeltaprof "github.com/grafana/pyroscope-go/godeltaprof/http/pprof"
)

func (p *Plugin) newAPIRouter() *mux.Router {
	router := mux.NewRouter()

	// Public API endpoints (no auth required)

	versionRoute := router.HandleFunc("/version", p.handleGetVersion).Methods("GET")
	var metricsRoute *mux.Route
	if p.metrics != nil {
		// NOTE: deprecated in favor of the ServeMetrics hook. Consider removing in v1.0.
		// https://mattermost.atlassian.net/browse/MM-57549
		metricsRoute = router.Handle("/metrics", p.metrics.Handler()).Methods("GET")
	}
	standaloneRoute := router.PathPrefix("/standalone/").HandlerFunc(p.handleServeStandalone).Methods("GET")

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

			if standaloneRoute.Match(r, &mux.RouteMatch{}) {
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

	// Debug
	debugRouter := router.PathPrefix("/debug").Methods("GET").Subrouter()
	debugRouter.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var res httpResponse
			defer p.httpAudit("handleDebug", &res, w, r)

			if userID := r.Header.Get("Mattermost-User-Id"); !p.API.HasPermissionTo(userID, model.PermissionManageSystem) {
				res.Err = "Forbidden"
				res.Code = http.StatusForbidden
				return
			}

			next.ServeHTTP(w, r)
		})
	})
	debugRouter.HandleFunc("/pprof/profile", pprof.Profile).Methods("GET")
	debugRouter.HandleFunc("/pprof/trace", pprof.Trace).Methods("GET")
	debugRouter.HandleFunc("/pprof/", pprof.Index).Methods("GET")
	debugRouter.HandleFunc("/pprof/delta_heap", godeltaprof.Heap).Methods("GET")
	debugRouter.HandleFunc("/pprof/delta_block", godeltaprof.Block).Methods("GET")
	debugRouter.HandleFunc("/pprof/delta_mutex", godeltaprof.Mutex).Methods("GET")
	debugRouter.HandleFunc("/pprof/{profile}", pprof.Index).Methods("GET")

	// Config
	router.HandleFunc("/config", func(w http.ResponseWriter, r *http.Request) {
		if err := p.handleConfig(w, r); err != nil {
			p.handleError(w, err)
		}
	}).Methods("GET")

	// CallsChannels
	router.HandleFunc("/{channel_id:[a-z0-9]{26}}", p.handleGetCallChannelState).Methods("GET") // DEPRECATED as of v1
	router.HandleFunc("/{channel_id:[a-z0-9]{26}}", p.handlePostCallsChannel).Methods("POST")   // DEPRECATED as of v1
	router.HandleFunc("/channels", p.handleGetAllCallChannelStates).Methods("GET")              // DEPRECATED as of v1

	// router.HandleFunc("/channels/{channel_id:[a-z0-9]{26}}", p.handleGetCallsChannel).Methods("GET")
	// router.HandleFunc("/channels/{channel_id:[a-z0-9]{26}}", p.handlePostCallsChannel).Methods("POST")

	// Calls
	router.HandleFunc("/calls/{channel_id:[a-z0-9]{26}}/dismiss-notification", p.handleDismissNotification).Methods("POST")
	router.HandleFunc("/calls/{call_id:[a-z0-9]{26}}/recording/{action}", p.handleRecordingAction).Methods("POST")
	router.HandleFunc("/calls/{channel_id:[a-z0-9]{26}}/active", p.handleGetCallActive).Methods("GET")

	// Deprecated for hostCtrlRounder /end, but needed for mobile backward compatibility (pre 2.18)
	router.HandleFunc("/calls/{call_id:[a-z0-9]{26}}/end", p.handleEnd).Methods("POST")

	// Host Controls
	hostCtrlRouter := router.PathPrefix("/calls/{call_id:[a-z0-9]{26}}/host").Subrouter()
	hostCtrlRouter.HandleFunc("/make", p.handleMakeHost).Methods("POST")
	hostCtrlRouter.HandleFunc("/mute", p.handleMuteSession).Methods("POST")
	hostCtrlRouter.HandleFunc("/screen-off", p.handleScreenOff).Methods("POST")
	hostCtrlRouter.HandleFunc("/lower-hand", p.handleLowerHand).Methods("POST")
	hostCtrlRouter.HandleFunc("/remove", p.handleRemoveSession).Methods("POST")
	hostCtrlRouter.HandleFunc("/mute-others", p.handleMuteOthers).Methods("POST")
	hostCtrlRouter.HandleFunc("/end", p.handleEnd).Methods("POST")

	// Bot
	botRouter := router.PathPrefix("/bot").Subrouter()
	botRouter.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !p.isBotSession(r) {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}

			if !p.licenseChecker.RecordingsAllowed() {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	})
	botRouter.HandleFunc("/channels/{channel_id:[a-z0-9]{26}}", p.handleBotGetChannel).Methods("GET")
	botRouter.HandleFunc("/users/{user_id:[a-z0-9]{26}}/image", p.handleBotGetUserImage).Methods("GET")
	botRouter.HandleFunc("/calls/{call_id:[a-z0-9]{26}}/sessions/{session_id:[a-z0-9]{26}}/profile", p.handleBotGetProfileForSession).Methods("GET")
	botRouter.HandleFunc("/calls/{call_id:[a-z0-9]{26}}/filename", p.handleBotGetFilenameForCall).Methods("GET")
	botRouter.HandleFunc("/uploads/{upload_id:[a-z0-9]{26}}", p.handleBotGetUpload).Methods("GET")
	botRouter.HandleFunc("/uploads", p.handleBotCreateUpload).Methods("POST")
	botRouter.HandleFunc("/uploads/{upload_id:[a-z0-9]{26}}", p.handleBotUploadData).Methods("POST")
	botRouter.HandleFunc("/calls/{call_id:[a-z0-9]{26}}/recordings", p.handleBotPostRecordings).Methods("POST")
	botRouter.HandleFunc("/calls/{call_id:[a-z0-9]{26}}/transcriptions", p.handleBotPostTranscriptions).Methods("POST")
	botRouter.HandleFunc("/calls/{call_id:[a-z0-9]{26}}/jobs/{job_id:[a-z0-9]{26}}/status", p.handleBotPostJobsStatus).Methods("POST")

	// TURN
	router.HandleFunc("/turn-credentials", p.handleGetTURNCredentials).Methods("GET")

	// Telemetry
	router.HandleFunc("/telemetry/track", p.handleTrackEvent).Methods("POST")

	// Cloud
	router.HandleFunc("/cloud-notify-admins", func(w http.ResponseWriter, r *http.Request) {
		// End user has requested to notify their admin about upgrading for calls
		if err := p.handleCloudNotifyAdmins(w, r); err != nil {
			p.handleError(w, err)
		}
	}).Methods("POST")

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
			if botRouter.Match(r, &mux.RouteMatch{}) {
				next.ServeHTTP(w, r)
				return
			}

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
