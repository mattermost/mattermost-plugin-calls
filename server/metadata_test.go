package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestJobMetadata(t *testing.T) {
	t.Run("empty", func(t *testing.T) {
		var jm *jobMetadata
		m := jm.toMap()
		require.Empty(t, m)
		jm = &jobMetadata{}
		m = jm.toMap()
		require.Empty(t, m)
	})

	t.Run("to/from", func(t *testing.T) {
		jm := jobMetadata{
			FileID: "fileID",
			TrID:   "trID",
			PostID: "postID",
		}
		m := jm.toMap()
		require.Equal(t, map[string]any{
			"file_id": "fileID",
			"tr_id":   "trID",
			"post_id": "postID",
		}, m)

		var jm2 jobMetadata
		jm2.fromMap(m)
		require.Equal(t, jm, jm)
	})
}
