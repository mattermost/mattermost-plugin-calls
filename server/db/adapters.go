package db

import (
	"database/sql/driver"
	"encoding/json"
)

type jsonValueWrapper struct {
	binaryParams bool
	value        any
}

func (s *Store) newJSONValueWrapper(value any) jsonValueWrapper {
	return jsonValueWrapper{
		binaryParams: s.binaryParams,
		value:        value,
	}
}

func (v jsonValueWrapper) Value() (driver.Value, error) {
	data, err := json.Marshal(v.value)
	if err != nil {
		return nil, err
	}
	if v.binaryParams {
		return append([]byte{0x01}, data...), nil
	}
	return data, nil
}
