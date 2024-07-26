package public

import (
	"fmt"
)

type JobType string

const (
	JobTypeRecording    JobType = "recording"
	JobTypeTranscribing JobType = "transcribing"
	JobTypeCaptioning   JobType = "captioning"
)

func (t JobType) IsValid() error {
	if t == "" {
		return fmt.Errorf("should not be empty")
	}

	switch t {
	case JobTypeRecording:
	case JobTypeTranscribing:
	case JobTypeCaptioning:
	default:
		return fmt.Errorf("invalid job type %q", t)
	}

	return nil
}

type JobStatusType string

const (
	JobStatusTypeStarted JobStatusType = "started"
	JobStatusTypeFailed  JobStatusType = "failed"
)

type JobStatus struct {
	JobType JobType
	Status  JobStatusType
	Error   string `json:"omitempty"`
}

// We need aliases so that we can have different validation rules.
type RecordingJobInfo struct {
	// Recording job ID
	JobID string
	// Call post ID
	PostID string
	// Recording files IDs
	FileIDs []string
}

type Transcription struct {
	Title    string
	Language string
	FileIDs  []string
}

type Transcriptions []Transcription

type CaptionMsg struct {
	SessionID     string  `json:"session_id"`
	Text          string  `json:"text"`
	NewAudioLenMs float64 `json:"new_audio_len_ms"`
}

type MetricName string

const (
	MetricLiveCaptionsWindowDropped       MetricName = "live_captions_window_dropped"
	MetricLiveCaptionsTranscriberBufFull  MetricName = "live_captions_transcriber_buf_full"
	MetricLiveCaptionsPktPayloadChBufFull MetricName = "live_captions_pktPayloadCh_buf_full"
)

type MetricMsg struct {
	SessionID  string     `json:"session_id"`
	MetricName MetricName `json:"metric_name"`
}

type TranscribingJobInfo struct {
	// Transcribing job ID
	JobID string
	// Call post ID
	PostID string
	// Transcription metadata
	Transcriptions Transcriptions
}

func (i RecordingJobInfo) IsValid() error {
	if i.PostID == "" {
		return fmt.Errorf("PostID should not be empty")
	}

	if len(i.FileIDs) == 0 {
		return fmt.Errorf("invalid FileIDs length")
	}

	if i.JobID == "" {
		return fmt.Errorf("JobID should not be empty")
	}

	return nil
}

func (i TranscribingJobInfo) IsValid() error {
	if i.PostID == "" {
		return fmt.Errorf("PostID should not be empty")
	}

	if len(i.Transcriptions) == 0 {
		return fmt.Errorf("invalid Transcriptions length")
	}

	for _, t := range i.Transcriptions {
		if err := t.IsValid(); err != nil {
			return err
		}
	}

	if i.JobID == "" {
		return fmt.Errorf("JobID should not be empty")
	}

	return nil
}

func (t Transcription) IsValid() error {
	if t.Language == "" {
		return fmt.Errorf("Language should not be empty")
	}

	if len(t.FileIDs) < 2 {
		return fmt.Errorf("invalid FileIDs length")
	}

	return nil
}

// We need to do some magic in order to go through the RCP layer without errors.
func (t Transcription) ToClientMap() map[string]any {
	if t.Title == "" {
		t.Title = t.Language
	}
	return map[string]any{
		"title":    t.Title,
		"language": t.Language,
		"file_id":  t.FileIDs[0],
	}
}

func (t Transcriptions) ToClientCaptions() []any {
	captions := make([]any, len(t))
	for i := range t {
		captions[i] = t[i].ToClientMap()
	}
	return captions
}
