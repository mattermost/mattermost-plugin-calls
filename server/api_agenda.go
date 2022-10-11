package main

import (
	"encoding/json"
	"github.com/mattermost/mattermost-server/v6/model"
	"net/http"
)

type Agenda struct {
	Title string        `json:"title"`
	Items []*AgendaItem `json:"items"`
}

type AgendaItem struct {
	ID             string `json:"id"`
	Title          string `json:"title"`
	Description    string `json:"description"`
	State          string `json:"state"`
	AssigneeID     string `json:"assignee_id"`
	Command        string `json:"command"`
	CommandLastRun int64  `json:"command_last_run"`
	DueDate        int64  `json:"due_date"`
}

func (p *Plugin) handleGetAgenda(w http.ResponseWriter, r *http.Request, token string, channelID string) {
	userID := r.Header.Get("Mattermost-User-Id")
	if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionReadChannel) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	agenda := &Agenda{
		Title: "Up Next",
		Items: []*AgendaItem{},
	}

	blocks, err := p.fbStore.GetUpnextCards(token, channelID)
	if err != nil {
		http.Error(w, "unable to get cards for agenda: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if len(blocks) > 0 {
		agenda.Items = make([]*AgendaItem, len(blocks))
		for i, block := range blocks {
			agenda.Items[i] = &AgendaItem{
				ID:    block.ID,
				Title: block.Title,
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(agenda); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleUpdateAgendaItem(w http.ResponseWriter, r *http.Request, token string, channelID string) {
	var res httpResponse
	defer p.httpAudit("handleUpdateAgendaItem", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionReadChannel) {
		res.Err = "Forbidden"
		res.Code = http.StatusForbidden
		return
	}

	var item AgendaItem
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(&item); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	oldItem, err := p.fbStore.GetAgendaItem(token, channelID, item.ID)
	if err != nil {
		res.Err = err.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	// Has status been updated?
	// ASSUMPTION: We're only handling UpNext -> Done or Done -> UpNext transitions at the moment.
	if oldItem.State == StatusUpNext && item.State == "closed" {
		err = p.fbStore.UpdateCardStatus(token, channelID, item.ID, StatusDone)
		if err != nil {
			res.Err = err.Error()
			res.Code = http.StatusInternalServerError
			return
		}
	}

	if oldItem.State == StatusDone && item.State == "" {
		err = p.fbStore.UpdateCardStatus(token, channelID, item.ID, StatusUpNext)
		if err != nil {
			res.Err = err.Error()
			res.Code = http.StatusInternalServerError
			return
		}
	}

	if oldItem.Title != item.Title {
		err = p.fbStore.UpdateCardTitle(token, channelID, item.ID, item.Title)
		if err != nil {
			res.Err = err.Error()
			res.Code = http.StatusInternalServerError
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(item); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleAddAgendaItem(w http.ResponseWriter, r *http.Request, token string, channelID string) {
	var res httpResponse
	defer p.httpAudit("handleAddAgendaItem", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionReadChannel) {
		res.Err = "Forbidden"
		res.Code = http.StatusForbidden
		return
	}

	var item AgendaItem
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(&item); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	block, err := p.fbStore.AddCard(userID, token, channelID, item.Title)
	if err != nil {
		res.Err = err.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	item.ID = block.ID

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(item); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleReorderItems(w http.ResponseWriter, r *http.Request, token string, channelID string) {
	var res httpResponse
	defer p.httpAudit("handleAddAgendaItem", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionReadChannel) {
		res.Err = "Forbidden"
		res.Code = http.StatusForbidden
		return
	}

	var newItemOrder []string
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(&newItemOrder); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	if err := p.fbStore.UpdateCardOrder(token, channelID, newItemOrder); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	result := map[string]bool{
		"success": true,
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(result); err != nil {
		p.LogError(err.Error())

	}
}

func (p *Plugin) handleDeleteAgendaItem(w http.ResponseWriter, r *http.Request, token string, channelID string, itemID string) {
	var res httpResponse
	defer p.httpAudit("handleAddAgendaItem", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionReadChannel) {
		res.Err = "Forbidden"
		res.Code = http.StatusForbidden
		return
	}

	if err := p.fbStore.DeleteCard(token, channelID, itemID); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	result := map[string]bool{
		"success": true,
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(result); err != nil {
		p.LogError(err.Error())

	}
}
