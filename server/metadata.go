package main

import (
	"fmt"
)

type jobMetadata struct {
	FileID string
	PostID string
	RecID  string
	TrID   string
}

func (jm *jobMetadata) toMap() map[string]any {
	if jm == nil {
		return nil
	}

	m := map[string]any{}

	if jm.FileID != "" {
		m["file_id"] = jm.FileID
	}

	if jm.RecID != "" {
		m["rec_id"] = jm.RecID
	}

	if jm.TrID != "" {
		m["tr_id"] = jm.TrID
	}

	if jm.PostID != "" {
		m["post_id"] = jm.PostID
	}

	return m
}

func (jm *jobMetadata) fromMap(data any) {
	m, ok := data.(map[string]any)
	if !ok {
		return
	}

	if m == nil {
		return
	}

	fileID, ok := m["file_id"].(string)
	if ok {
		jm.FileID = fileID
	}

	recID, ok := m["rec_id"].(string)
	if ok {
		jm.RecID = recID
	}

	trID, ok := m["tr_id"].(string)
	if ok {
		jm.TrID = trID
	}

	postID, ok := m["post_id"].(string)
	if ok {
		jm.PostID = postID
	}
}

func (p *Plugin) saveRecordingMetadata(postID, recID, trID string) error {
	post, appErr := p.API.GetPost(postID)
	if appErr != nil {
		return fmt.Errorf("failed to get call post: %w", appErr)
	}

	rm := jobMetadata{
		TrID: trID,
	}

	recordings, ok := post.GetProp("recordings").(map[string]any)
	if !ok {
		recordings = map[string]any{
			recID: rm.toMap(),
		}
	} else {
		recordings[recID] = rm.toMap()
	}
	post.AddProp("recordings", recordings)

	if trID != "" {
		tm := jobMetadata{
			RecID: recID,
		}

		transcriptions, ok := post.GetProp("transcriptions").(map[string]any)
		if !ok {
			transcriptions = map[string]any{
				trID: tm.toMap(),
			}
		} else {
			recordings[trID] = tm.toMap()
		}
		post.AddProp("transcriptions", transcriptions)
	}

	if _, appErr := p.API.UpdatePost(post); appErr != nil {
		return fmt.Errorf("failed to update call post: %w", appErr)
	}

	return nil
}
