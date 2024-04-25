package main

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestImportScript(t *testing.T) {
	tests := []struct {
		name    string
		script  string
		want    Script
		wantErr bool
	}{
		{
			name: "basic script",
			script: `Alice-F Bob-M

2s
Alice
Hi.

200ms
Bob
Hi back.

1m
Bob
Hi also. Jinx.
Alice
Hi again.
`,
			want: Script{
				users:     []string{"Alice", "Bob"},
				nameToIdx: map[string]int{"Alice": 0, "Bob": 1},
				blocks: []Block{
					{
						delay:    2 * time.Second,
						speakers: []int{0},
						text:     []string{"Hi."},
					},
					{
						delay:    200 * time.Millisecond,
						speakers: []int{1},
						text:     []string{"Hi back."},
					},
					{
						delay:    1 * time.Minute,
						speakers: []int{1, 0},
						text:     []string{"Hi also. Jinx.", "Hi again."},
					},
				},
			},
			wantErr: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := importScript(strings.NewReader(tt.script))
			// ignore the randomized voiceIDs
			got.voiceIDs = nil
			if (err != nil) != tt.wantErr {
				t.Errorf("importScript() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("importScript() got = %v, want %v", got, tt.want)
			}
		})
	}
}
