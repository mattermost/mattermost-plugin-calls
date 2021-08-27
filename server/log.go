package main

import (
	"fmt"
	"runtime"
	"strings"
)

const pkgPath = "github.com/mattermost/mattermost-plugin-talk/server/"

func getErrOrigin() string {
	var origin string
	if pc, file, line, ok := runtime.Caller(2); ok {
		if f := runtime.FuncForPC(pc); f != nil {
			origin = fmt.Sprintf("%s %s:%d", strings.TrimPrefix(f.Name(), pkgPath), strings.TrimPrefix(file, pkgPath), line)
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
