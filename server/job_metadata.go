package main

import (
	"fmt"
)

// jobMetadata holds information we save in post props
// to persist some state needed by call initiated jobs
// (e.g. recordings, transcriptions).
type jobMetadata struct {
	// FileID is the FileInfo.Id that the job produced (e.g. recording file).
	FileID string
	// PostID is the Post.Id that holds the job's artifacts (e.g. recording post).
	PostID string
	// RecID is the recording job ID.
	RecID string
	// TrID is the transcription job ID.
	TrID string
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
	post, err := p.store.GetPost(postID)
	if err != nil {
		return fmt.Errorf("failed to get call post: %w", err)
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

	// This is where we map a transcription to a recording.
	// This information will be used when the transcribing job completes to populate
	// the recording post props with the captions file id.
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
			transcriptions[trID] = tm.toMap()
		}
		post.AddProp("transcriptions", transcriptions)
	}

	if _, appErr := p.API.UpdatePost(post); appErr != nil {
		return fmt.Errorf("failed to update call post: %w", appErr)
	}

	return nil
}
