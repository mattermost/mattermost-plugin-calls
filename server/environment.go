// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"os"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/mattermost/rtcd/service/rtc"
)

// applyEnvOverrides takes a config struct and a prefix string, then looks for
// environment variables that match the pattern PREFIX_FIELD_NAME and applies
// those values to the corresponding fields in the config.
//
// Example: With prefix "MM_CALLS" and config field "RTCDServiceURL",
// it will look for env var "MM_CALLS_RTCD_SERVICE_URL"
//
// The function handles various field types including strings, booleans, integers,
// floats, and durations. It also supports embedded structs, treating their fields
// as if they were in the parent struct.
//
// It returns a map containing the field names and their corresponding environment
// variable values that were applied.
func (p *Plugin) applyEnvOverrides(config interface{}, prefix string) map[string]string {
	val := reflect.ValueOf(config)

	// Config must be a pointer to a struct
	if val.Kind() != reflect.Ptr || val.Elem().Kind() != reflect.Struct {
		p.LogError("applyEnvOverrides: config must be a pointer to a struct")
		return make(map[string]string)
	}

	// Dereference the pointer
	val = val.Elem()

	// Ensure prefix ends with underscore for consistent env var naming
	if prefix != "" && !strings.HasSuffix(prefix, "_") {
		prefix = prefix + "_"
	}

	overrideMap := make(map[string]string)

	// Process the struct fields
	p.processStructFields(val, prefix, "", overrideMap)

	return overrideMap
}

// processStructFields recursively processes struct fields, including embedded structs.
// It applies environment variable overrides to fields and updates the overrideMap.
func (p *Plugin) processStructFields(val reflect.Value, prefix, fieldPath string, overrideMap map[string]string) {
	typ := val.Type()

	// Iterate through all fields in the struct
	for i := 0; i < val.NumField(); i++ {
		field := val.Field(i)
		fieldType := typ.Field(i)
		fieldName := fieldType.Name

		// Skip unexported fields
		if !field.CanSet() {
			continue
		}

		// Handle embedded structs
		if fieldType.Anonymous {
			// For embedded structs, we recurse without adding the struct name to the path
			if field.Kind() == reflect.Struct {
				p.processStructFields(field, prefix, fieldPath, overrideMap)
			} else if field.Kind() == reflect.Ptr && !field.IsNil() && field.Elem().Kind() == reflect.Struct {
				p.processStructFields(field.Elem(), prefix, fieldPath, overrideMap)
			} else if field.Kind() == reflect.Ptr && field.IsNil() && field.Type().Elem().Kind() == reflect.Struct {
				// Initialize nil pointer to embedded struct
				field.Set(reflect.New(field.Type().Elem()))
				p.processStructFields(field.Elem(), prefix, fieldPath, overrideMap)
			}
			continue
		}

		// Build the full field path for nested structs
		fullFieldPath := fieldPath
		if fullFieldPath != "" {
			fullFieldPath += "."
		}
		fullFieldPath += fieldName

		// Handle regular struct fields
		if field.Kind() == reflect.Struct && field.Type() != reflect.TypeOf(time.Time{}) {
			// Recurse into nested structs
			p.processStructFields(field, prefix, fullFieldPath, overrideMap)
		} else if field.Kind() == reflect.Ptr && !field.IsNil() && field.Elem().Kind() == reflect.Struct &&
			field.Elem().Type() != reflect.TypeOf(time.Time{}) {
			// Recurse into nested struct pointers
			p.processStructFields(field.Elem(), prefix, fullFieldPath, overrideMap)
		} else {
			// Regular field or pointer to non-struct
			// Convert field name to uppercase with underscores
			envKey := fieldNameToEnvKey(fieldName)
			envVar := prefix + envKey

			// Check if environment variable exists
			if envValue, exists := os.LookupEnv(envVar); exists {
				// Special handling for ICEServersConfigs to store the raw JSON
				if field.Type().String() == "main.ICEServersConfigs" ||
					(field.Kind() == reflect.Ptr && field.Type().Elem().String() == "main.ICEServersConfigs") {
					if p.setFieldFromEnv(field, envValue) {
						overrideMap[fullFieldPath] = envValue // Store the raw JSON string
					}
				} else if p.setFieldFromEnv(field, envValue) {
					overrideMap[fullFieldPath] = envValue
				}
			}
		}
	}
}

// Pre-compiled regular expressions for fieldNameToEnvKey
var (
	// Add underscore before uppercase letters that follow lowercase letters or digits
	// e.g., "camelCase" -> "camel_Case"
	reFieldLowerToUpper = regexp.MustCompile(`([a-z0-9])([A-Z])`)

	// Add underscore before uppercase letters that are followed by lowercase letters
	// and not preceded by an underscore
	// e.g., "RTCDService" -> "RTCD_Service"
	reFieldUpperToUpperLower = regexp.MustCompile(`([A-Z])([A-Z][a-z])`)
)

// fieldNameToEnvKey converts a camelCase or PascalCase field name to an
// uppercase environment variable key with underscores.
// Example: RTCDServiceURL -> RTCD_SERVICE_URL
func fieldNameToEnvKey(fieldName string) string {
	// Apply the pre-compiled regular expressions
	s := reFieldLowerToUpper.ReplaceAllString(fieldName, "${1}_${2}")
	s = reFieldUpperToUpperLower.ReplaceAllString(s, "${1}_${2}")

	// Convert to uppercase
	return strings.ToUpper(s)
}

// setFieldFromEnv attempts to set a field's value from an environment variable string.
// Returns true if the value was successfully set, false otherwise.
func (p *Plugin) setFieldFromEnv(field reflect.Value, envValue string) bool {
	// Handle pointer types
	if field.Kind() == reflect.Ptr {
		// If it's nil, initialize it
		if field.IsNil() {
			field.Set(reflect.New(field.Type().Elem()))
		}
		// Set the value that the pointer points to
		return p.setFieldFromEnv(field.Elem(), envValue)
	}

	switch field.Kind() {
	case reflect.String:
		field.SetString(envValue)
		return true

	case reflect.Bool:
		b, err := strconv.ParseBool(envValue)
		if err == nil {
			field.SetBool(b)
			return true
		}
		p.LogError("Failed to parse bool from environment variable", "error", err.Error(), "value", envValue)
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		// Special case for time.Duration
		if field.Type() == reflect.TypeOf(time.Duration(0)) {
			d, err := time.ParseDuration(envValue)
			if err == nil {
				field.SetInt(int64(d))
				return true
			}
			p.LogError("Failed to parse duration from environment variable", "error", err.Error(), "value", envValue)
		} else if i, err := strconv.ParseInt(envValue, 10, 64); err == nil {
			// Check if the value fits in the field's type
			if field.OverflowInt(i) {
				p.LogError("Integer value overflows the field type", "value", envValue, "type", field.Type().String())
				return false
			}
			field.SetInt(i)
			return true
		} else {
			p.LogError("Failed to parse integer from environment variable", "error", err.Error(), "value", envValue)
		}

	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		i, err := strconv.ParseUint(envValue, 10, 64)
		if err == nil {
			// Check if the value fits in the field's type
			if field.OverflowUint(i) {
				p.LogError("Unsigned integer value overflows the field type", "value", envValue, "type", field.Type().String())
				return false
			}
			field.SetUint(i)
			return true
		}
		p.LogError("Failed to parse unsigned integer from environment variable", "error", err.Error(), "value", envValue)
	case reflect.Float32, reflect.Float64:
		f, err := strconv.ParseFloat(envValue, 64)
		if err == nil {
			// Check if the value fits in the field's type
			if field.OverflowFloat(f) {
				p.LogError("Float value overflows the field type", "value", envValue, "type", field.Type().String())
				return false
			}
			field.SetFloat(f)
			return true
		}
		p.LogError("Failed to parse float from environment variable", "error", err.Error(), "value", envValue)
	case reflect.Slice:
		// Handle ICEServersConfigs specially as JSON
		if field.Type().String() == "main.ICEServersConfigs" {
			var configs []rtc.ICEServerConfig
			err := json.Unmarshal([]byte(envValue), &configs)
			if err == nil {
				field.Set(reflect.ValueOf(configs))
				return true
			}

			// Log error
			p.LogError("Failed to unmarshal ICEServersConfigs from environment variable", "error", err.Error(), "value", envValue)
			return false
		}

		// Handle string slices by splitting on commas
		if field.Type().Elem().Kind() == reflect.String {
			values := strings.Split(envValue, ",")
			slice := reflect.MakeSlice(field.Type(), len(values), len(values))
			for i, v := range values {
				slice.Index(i).SetString(strings.TrimSpace(v))
			}
			field.Set(slice)
			return true
		}
	}

	return false
}
