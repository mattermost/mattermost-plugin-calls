package public

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestICECandidateInfoIsValid(t *testing.T) {
	tcs := []struct {
		name string
		info ICECandidateInfo
		err  string
	}{
		{
			name: "missing type",
			info: ICECandidateInfo{
				Protocol: "udp",
			},
			err: `invalid type ""`,
		},
		{
			name: "missing protocol",
			info: ICECandidateInfo{
				Type: "host",
			},
			err: `invalid protocol ""`,
		},
		{
			name: "invalid type",
			info: ICECandidateInfo{
				Type:     "invalid",
				Protocol: "udp",
			},
			err: `invalid type "invalid"`,
		},
		{
			name: "invalid protocol",
			info: ICECandidateInfo{
				Type:     "host",
				Protocol: "invalid",
			},
			err: `invalid protocol "invalid"`,
		},
		{
			name: "valid, udp",
			info: ICECandidateInfo{
				Type:     "host",
				Protocol: "udp",
			},
		},
		{
			name: "valid, tcp",
			info: ICECandidateInfo{
				Type:     "host",
				Protocol: "tcp",
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

func TestClientICECandidatePairMetricPayloadIsValid(t *testing.T) {
	tcs := []struct {
		name string
		info ClientICECandidatePairMetricPayload
		err  string
	}{
		{
			name: "missing state",
			info: ClientICECandidatePairMetricPayload{
				Local: ICECandidateInfo{
					Type:     "host",
					Protocol: "udp",
				},
				Remote: ICECandidateInfo{
					Type:     "host",
					Protocol: "udp",
				},
			},
			err: `invalid state ""`,
		},
		{
			name: "invalid state",
			info: ClientICECandidatePairMetricPayload{
				State: "invalid",
				Local: ICECandidateInfo{
					Type:     "host",
					Protocol: "udp",
				},
				Remote: ICECandidateInfo{
					Type:     "host",
					Protocol: "udp",
				},
			},
			err: `invalid state "invalid"`,
		},
		{
			name: "missing local",
			info: ClientICECandidatePairMetricPayload{
				State: "succeeded",
				Remote: ICECandidateInfo{
					Type:     "host",
					Protocol: "udp",
				},
			},
			err: `invalid local candidate info: invalid type ""`,
		},
		{
			name: "missing remote",
			info: ClientICECandidatePairMetricPayload{
				State: "succeeded",
				Local: ICECandidateInfo{
					Type:     "host",
					Protocol: "udp",
				},
			},
			err: `invalid remote candidate info: invalid type ""`,
		},
		{
			name: "valid",
			info: ClientICECandidatePairMetricPayload{
				State: "failed",
				Local: ICECandidateInfo{
					Type:     "host",
					Protocol: "udp",
				},
				Remote: ICECandidateInfo{
					Type:     "host",
					Protocol: "udp",
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
