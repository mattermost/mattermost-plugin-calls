package public

import (
	"encoding/json"
	"fmt"
)

type StringArray []string

func (js *StringArray) Scan(src any) error {
	data, ok := src.([]byte)
	if !ok {
		return fmt.Errorf("unsupported source type %T", src)
	}

	return json.Unmarshal(data, js)
}

type StringMap map[string]any

func (js *StringMap) Scan(src any) error {
	data, ok := src.([]byte)
	if !ok {
		return fmt.Errorf("unsupported source type %T", src)
	}

	return json.Unmarshal(data, js)
}

func (cs *CallStats) Scan(src any) error {
	data, ok := src.([]byte)
	if !ok {
		return fmt.Errorf("unsupported source type %T", src)
	}

	return json.Unmarshal(data, cs)
}

func (cp *CallProps) Scan(src any) error {
	data, ok := src.([]byte)
	if !ok {
		return fmt.Errorf("unsupported source type %T", src)
	}

	return json.Unmarshal(data, cp)
}

func (jp *CallJobProps) Scan(src any) error {
	data, ok := src.([]byte)
	if !ok {
		return fmt.Errorf("unsupported source type %T", src)
	}

	return json.Unmarshal(data, jp)
}
