package public

type CallsChannel struct {
	ChannelID string         `json:"channel_id"`
	Enabled   bool           `json:"enabled"`
	Props     map[string]any `json:"props,omitempty"`
}
