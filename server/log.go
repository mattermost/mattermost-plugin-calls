// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"fmt"
	"log"
	"runtime"
	"runtime/debug"
	"strings"

	"github.com/mattermost/logr/v2"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

const pkgPath = "github.com/mattermost/mattermost-plugin-calls/server/"
const rtcdPrefix = "/service/rtc"

func (p *Plugin) logPanic(reason any) {
	p.LogError(fmt.Sprintf("panic: %v", reason))

	for _, line := range strings.Split(string(debug.Stack()), "\n") {
		p.LogError(strings.TrimSpace(line))
	}
}

func getErrOrigin() string {
	var origin string
	if pc, file, line, ok := runtime.Caller(2); ok {
		if f := runtime.FuncForPC(pc); f != nil {
			if idx := strings.Index(f.Name(), rtcdPrefix); idx > 0 {
				if idx2 := strings.Index(file, rtcdPrefix); idx2 > 0 {
					file = file[idx2:]
				}
				origin = fmt.Sprintf("%s %s:%d", f.Name()[idx:], file, line)
			} else {
				origin = fmt.Sprintf("%s %s:%d", strings.TrimPrefix(f.Name(), pkgPath), strings.TrimPrefix(file, pkgPath), line)
			}
		}
	}
	return origin
}

func (p *Plugin) LogDebug(msg string, keyValuePairs ...interface{}) {
	args := append([]interface{}{"origin", getErrOrigin()}, keyValuePairs...)
	if isDebug != "" {
		p.API.LogInfo(msg, args...)
		return
	}
	p.API.LogDebug(msg, args...)
}

func (p *Plugin) LogInfo(msg string, keyValuePairs ...interface{}) {
	args := append([]interface{}{"origin", getErrOrigin()}, keyValuePairs...)
	p.API.LogInfo(msg, args...)
}

func (p *Plugin) LogError(msg string, keyValuePairs ...interface{}) {
	args := append([]interface{}{"origin", getErrOrigin()}, keyValuePairs...)
	p.API.LogError(msg, args...)
}

func (p *Plugin) LogWarn(msg string, keyValuePairs ...interface{}) {
	args := append([]interface{}{"origin", getErrOrigin()}, keyValuePairs...)
	p.API.LogWarn(msg, args...)
}

type logger struct {
	p *Plugin
}

func newLogger(p *Plugin) *logger {
	return &logger{
		p: p,
	}
}

func (l *logger) fieldsToArgs(fields []logr.Field) []interface{} {
	var buf bytes.Buffer
	args := []interface{}{"origin", getErrOrigin()}
	for _, field := range fields {
		args = append(args, field.Key)
		if err := field.ValueString(&buf, nil); err != nil {
			l.p.LogError(err.Error())
			continue
		}
		args = append(args, buf.String())
		buf.Reset()
	}
	return args
}

func (l *logger) Trace(msg string, fields ...logr.Field) {
	l.p.API.LogDebug(msg, l.fieldsToArgs(fields)...)
}

func (l *logger) Debug(msg string, fields ...logr.Field) {
	l.p.API.LogDebug(msg, l.fieldsToArgs(fields)...)
}

func (l *logger) Info(msg string, fields ...logr.Field) {
	l.p.API.LogInfo(msg, l.fieldsToArgs(fields)...)
}

func (l *logger) Warn(msg string, fields ...logr.Field) {
	l.p.API.LogWarn(msg, l.fieldsToArgs(fields)...)
}

func (l *logger) Error(msg string, fields ...logr.Field) {
	l.p.API.LogError(msg, l.fieldsToArgs(fields)...)
}

func (l *logger) Critical(msg string, fields ...logr.Field) {
	l.p.API.LogError(msg, l.fieldsToArgs(fields)...)
}

func (l *logger) Fatal(msg string, fields ...logr.Field) {
	l.p.API.LogError(msg, l.fieldsToArgs(fields)...)
}

// Satisfying the interface here but we need a fix upstream for this to be any useful.
func (l *logger) Sugar(_ ...logr.Field) logr.Sugar {
	return logr.Sugar{}
}

func (l *logger) Flush() error {
	return nil
}

func (l *logger) StdLogger(_ logr.Level) *log.Logger {
	return nil
}

func (l *logger) Log(_ logr.Level, msg string, fields ...logr.Field) {
	l.p.API.LogDebug(msg, l.fieldsToArgs(fields)...)
}

func (l *logger) LogM(_ []logr.Level, msg string, fields ...logr.Field) {
	l.p.API.LogDebug(msg, l.fieldsToArgs(fields)...)
}

func (l *logger) IsLevelEnabled(_ logr.Level) bool {
	return false
}

func (l *logger) With(_ ...logr.Field) *mlog.Logger {
	return nil
}
