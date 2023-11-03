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
	PostID  string
	FileIDs []string
	JobID   string
}

// We need aliases so that we can have different validation rules.
type RecordingJobInfo JobInfo
type TranscribingJobInfo JobInfo

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

	if len(i.FileIDs) != 2 {
		return fmt.Errorf("invalid FileIDs length")
	}

	if i.JobID == "" {
		return fmt.Errorf("JobID should not be empty")
	}

	return nil
}
