package public

import (
	"fmt"
)

type JobType string

const (
	JobTypeRecording    JobType = "recording"
	JobTypeTranscribing         = "transcribing"
)

type JobStatusType string

const (
	JobStatusTypeStarted JobStatusType = "started"
	JobStatusTypeFailed                = "failed"
)

type JobStatus struct {
	JobType JobType
	Status  JobStatusType
	Error   string `json:"omitempty"`
}

type JobInfo struct {
	PostID string
	FileID string
	JobID  string
}

func (i JobInfo) IsValid() error {
	if i == (JobInfo{}) {
		return fmt.Errorf("invalid empty info")
	}

	if i.PostID == "" {
		return fmt.Errorf("PostID should not be empty")
	}

	if i.FileID == "" {
		return fmt.Errorf("FileID should not be empty")
	}

	if i.JobID == "" {
		return fmt.Errorf("JobID should not be empty")
	}

	return nil
}
