package public

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
)

type StringArray []string

func (js StringArray) Value() (driver.Value, error) {
	return json.Marshal(js)
}

func (js *StringArray) Scan(src any) error {
	data, ok := src.([]byte)
	if !ok {
		return fmt.Errorf("unsupported source type %T", src)
	}

	return json.Unmarshal(data, js)
}

type StringMap map[string]any

func (js StringMap) Value() (driver.Value, error) {
	return json.Marshal(js)
}

func (js *StringMap) Scan(src any) error {
	data, ok := src.([]byte)
	if !ok {
		return fmt.Errorf("unsupported source type %T", src)
	}

	return json.Unmarshal(data, js)
}

func (cs CallStats) Value() (driver.Value, error) {
	return json.Marshal(cs)
}

func (cs *CallStats) Scan(src any) error {
	data, ok := src.([]byte)
	if !ok {
		return fmt.Errorf("unsupported source type %T", src)
	}

	return json.Unmarshal(data, cs)
}
