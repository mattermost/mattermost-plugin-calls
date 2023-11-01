package public

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestJobInfoIsValid(t *testing.T) {
	tcs := []struct {
		name string
		info JobInfo
		err  string
	}{
		{
			name: "empty struct",
			info: JobInfo{},
			err:  "invalid empty info",
		},
		{
			name: "missing JobID",
			info: JobInfo{
				FileID: "srn9te5wnifg98ekrurcr7ty8c",
				PostID: "5khxhbp6t3r9tpxy6cxxqyrpge",
			},
			err: "JobID should not be empty",
		},
		{
			name: "missing FileID",
			info: JobInfo{
				JobID:  "g719uqqnrjry5jof9cjqe5zhcy",
				PostID: "5khxhbp6t3r9tpxy6cxxqyrpge",
			},
			err: "FileID should not be empty",
		},
		{
			name: "missing PostID",
			info: JobInfo{
				JobID:  "g719uqqnrjry5jof9cjqe5zhcy",
				FileID: "srn9te5wnifg98ekrurcr7ty8c",
			},
			err: "PostID should not be empty",
		},
		{
			name: "valid",
			info: JobInfo{
				JobID:  "g719uqqnrjry5jof9cjqe5zhcy",
				FileID: "srn9te5wnifg98ekrurcr7ty8c",
				PostID: "5khxhbp6t3r9tpxy6cxxqyrpge",
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
