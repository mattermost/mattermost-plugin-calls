package public

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRecordingJobInfoIsValid(t *testing.T) {
	tcs := []struct {
		name string
		info RecordingJobInfo
		err  string
	}{
		{
			name: "missing JobID",
			info: RecordingJobInfo{
				FileIDs: []string{"srn9te5wnifg98ekrurcr7ty8c"},
				PostID:  "5khxhbp6t3r9tpxy6cxxqyrpge",
			},
			err: "JobID should not be empty",
		},
		{
			name: "missing FileID",
			info: RecordingJobInfo{
				JobID:  "g719uqqnrjry5jof9cjqe5zhcy",
				PostID: "5khxhbp6t3r9tpxy6cxxqyrpge",
			},
			err: "invalid FileIDs length",
		},
		{
			name: "missing PostID",
			info: RecordingJobInfo{
				JobID:   "g719uqqnrjry5jof9cjqe5zhcy",
				FileIDs: []string{"srn9te5wnifg98ekrurcr7ty8c"},
			},
			err: "PostID should not be empty",
		},
		{
			name: "valid",
			info: RecordingJobInfo{
				JobID:   "g719uqqnrjry5jof9cjqe5zhcy",
				FileIDs: []string{"srn9te5wnifg98ekrurcr7ty8c"},
				PostID:  "5khxhbp6t3r9tpxy6cxxqyrpge",
			},
		},
	}

	for _, tc := range tcs {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.info.IsValid()
			if tc.err == "" {
				require.NoError(t, err)
			} else {
				require.EqualError(t, err, tc.err)
			}
		})
	}
}

func TestTranscribingJobInfoIsValid(t *testing.T) {
	tcs := []struct {
		name string
		info TranscribingJobInfo
		err  string
	}{
		{
			name: "missing JobID",
			info: TranscribingJobInfo{
				FileIDs: []string{"srn9te5wnifg98ekrurcr7ty8c", "gyzdsttw9jbxfgm9b4otburw7o"},
				PostID:  "5khxhbp6t3r9tpxy6cxxqyrpge",
			},
			err: "JobID should not be empty",
		},
		{
			name: "missing FileID",
			info: TranscribingJobInfo{
				JobID:  "g719uqqnrjry5jof9cjqe5zhcy",
				PostID: "5khxhbp6t3r9tpxy6cxxqyrpge",
			},
			err: "invalid FileIDs length",
		},
		{
			name: "not enough file ids",
			info: TranscribingJobInfo{
				JobID:   "g719uqqnrjry5jof9cjqe5zhcy",
				PostID:  "5khxhbp6t3r9tpxy6cxxqyrpge",
				FileIDs: []string{"srn9te5wnifg98ekrurcr7ty8c"},
			},
			err: "invalid FileIDs length",
		},
		{
			name: "missing PostID",
			info: TranscribingJobInfo{
				JobID:   "g719uqqnrjry5jof9cjqe5zhcy",
				FileIDs: []string{"srn9te5wnifg98ekrurcr7ty8c", "gyzdsttw9jbxfgm9b4otburw7o"},
			},
			err: "PostID should not be empty",
		},
		{
			name: "valid",
			info: TranscribingJobInfo{
				JobID:   "g719uqqnrjry5jof9cjqe5zhcy",
				FileIDs: []string{"srn9te5wnifg98ekrurcr7ty8c", "gyzdsttw9jbxfgm9b4otburw7o"},
				PostID:  "5khxhbp6t3r9tpxy6cxxqyrpge",
			},
		},
	}

	for _, tc := range tcs {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.info.IsValid()
			if tc.err == "" {
				require.NoError(t, err)
			} else {
				require.EqualError(t, err, tc.err)
			}
		})
	}
}
