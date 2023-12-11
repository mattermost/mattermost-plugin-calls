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
				Transcriptions: []Transcription{
					{
						Language: "en",
						FileIDs:  []string{"srn9te5wnifg98ekrurcr7ty8c", "gyzdsttw9jbxfgm9b4otburw7o"},
					},
				},
				PostID: "5khxhbp6t3r9tpxy6cxxqyrpge",
			},
			err: "JobID should not be empty",
		},
		{
			name: "missing Transcriptions",
			info: TranscribingJobInfo{
				JobID:  "g719uqqnrjry5jof9cjqe5zhcy",
				PostID: "5khxhbp6t3r9tpxy6cxxqyrpge",
			},
			err: "invalid Transcriptions length",
		},
		{
			name: "not enough file ids",
			info: TranscribingJobInfo{
				JobID:  "g719uqqnrjry5jof9cjqe5zhcy",
				PostID: "5khxhbp6t3r9tpxy6cxxqyrpge",
				Transcriptions: []Transcription{
					{
						Language: "en",
						FileIDs:  []string{"srn9te5wnifg98ekrurcr7ty8c"},
					},
				},
			},
			err: "invalid FileIDs length",
		},
		{
			name: "missing PostID",
			info: TranscribingJobInfo{
				JobID: "g719uqqnrjry5jof9cjqe5zhcy",
				Transcriptions: []Transcription{
					{
						Language: "en",
						FileIDs:  []string{"srn9te5wnifg98ekrurcr7ty8c", "gyzdsttw9jbxfgm9b4otburw7o"},
					},
				},
			},
			err: "PostID should not be empty",
		},
		{
			name: "valid",
			info: TranscribingJobInfo{
				JobID:  "g719uqqnrjry5jof9cjqe5zhcy",
				PostID: "5khxhbp6t3r9tpxy6cxxqyrpge",
				Transcriptions: []Transcription{
					{
						Language: "en",
						FileIDs:  []string{"srn9te5wnifg98ekrurcr7ty8c", "gyzdsttw9jbxfgm9b4otburw7o"},
					},
				},
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

func TestTranscriptionIsValid(t *testing.T) {
	tcs := []struct {
		name string
		tr   Transcription
		err  string
	}{
		{
			name: "missing language",
			err:  "Language should not be empty",
			tr: Transcription{
				Title: "title",
				FileIDs: []string{
					"fileA",
					"fileB",
				},
			},
		},
		{
			name: "invalid file ids",
			err:  "invalid FileIDs length",
			tr: Transcription{
				Title:    "title",
				Language: "it",
				FileIDs: []string{
					"fileA",
				},
			},
		},
		{
			name: "valid",
			tr: Transcription{
				Title:    "title",
				Language: "it",
				FileIDs: []string{
					"fileA",
					"fileB",
				},
			},
		},
	}

	for _, tc := range tcs {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.tr.IsValid()
			if tc.err == "" {
				require.NoError(t, err)
			} else {
				require.EqualError(t, err, tc.err)
			}
		})
	}
}

func TestTranscriptionToClientMap(t *testing.T) {
	t.Run("empty title", func(t *testing.T) {
		tr := Transcription{
			Language: "it",
			FileIDs: []string{
				"fileA",
				"fileB",
			},
		}
		require.Equal(t, map[string]any{
			"title":    "it",
			"language": "it",
			"file_id":  "fileA",
		}, tr.ToClientMap())
	})

	t.Run("with title", func(t *testing.T) {
		tr := Transcription{
			Title:    "title",
			Language: "it",
			FileIDs: []string{
				"fileA",
				"fileB",
			},
		}
		require.Equal(t, map[string]any{
			"title":    "title",
			"language": "it",
			"file_id":  "fileA",
		}, tr.ToClientMap())
	})
}

func TestTranscriptionsToClientCaptions(t *testing.T) {
	t.Run("empty", func(t *testing.T) {
		var trs Transcriptions
		require.Empty(t, trs.ToClientCaptions())
	})

	t.Run("not empty", func(t *testing.T) {
		trs := Transcriptions{
			Transcription{
				Title:    "title",
				Language: "it",
				FileIDs: []string{
					"fileA",
					"fileB",
				},
			},
			Transcription{
				Title:    "title",
				Language: "en",
				FileIDs: []string{
					"fileC",
					"fileD",
				},
			},
		}
		require.Equal(t, []any{
			trs[0].ToClientMap(),
			trs[1].ToClientMap(),
		}, trs.ToClientCaptions())
	})
}
