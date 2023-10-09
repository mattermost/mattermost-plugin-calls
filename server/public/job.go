package public

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
