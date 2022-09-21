// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"fmt"
	"github.com/mattermost/mattermost-server/v6/shared/mlog"
	"log"
	"runtime"
	"strings"

	"github.com/mattermost/logr/v2"
)

const pkgPath = "github.com/mattermost/mattermost-plugin-calls/server/"
const rtcdPrefix = "/service/rtc"

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

type logger struct {
	p *Plugin
}

func (l *logger) Trace(s string, field ...mlog.Field) {
	//TODO implement me
	panic("implement me")
}

func (l *logger) Fatal(s string, field ...mlog.Field) {
	//TODO implement me
	panic("implement me")
}

func (l *logger) With(fields ...mlog.Field) *mlog.Logger {
	//TODO implement me
	panic("implement me")
}

func (l *logger) Flush() error {
	//TODO implement me
	panic("implement me")
}

func (l *logger) StdLogger(level mlog.Level) *log.Logger {
	//TODO implement me
	panic("implement me")
}

func newLogger(p *Plugin) *logger {
	return &logger{
		p: p,
	}
}

func (l *logger) fieldsToArgs(fields []logr.Field) []interface{} {
	var buf bytes.Buffer
	args := append([]interface{}{"origin", getErrOrigin()})
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

func (l *logger) Log(_ logr.Level, msg string, fields ...logr.Field) {
	l.p.API.LogDebug(msg, l.fieldsToArgs(fields)...)
}

func (l *logger) LogM(_ []logr.Level, msg string, fields ...logr.Field) {
	l.p.API.LogDebug(msg, l.fieldsToArgs(fields)...)
}

func (l *logger) IsLevelEnabled(_ logr.Level) bool {
	return false
}
