package main

import (
	"github.com/prometheus/client_golang/prometheus"
)

func (p *Plugin) getAllChannelKeys() ([]string, error) {
	var page int
	perPage := 200
	var keyList []string

	for {
		p.metrics.StoreOpCounters.With(prometheus.Labels{"type": "KVList"}).Inc()
		keys, appErr := p.API.KVList(page, perPage)
		if appErr != nil {
			return nil, appErr
		}
		if len(keys) == 0 {
			break
		}

		for _, k := range keys {
			// TODO: this is a stop-gap; we need to have a better kvstore key naming discipline so that we can
			// use something like  WithPrefix from plugin-api. But ideally, we should move to a SQL store.
			// https://mattermost.atlassian.net/browse/MM-42464

			if k == "mmi_botid" {
				// ignore because this is the bot's id
				continue
			}

			keyList = append(keyList, k)
		}

		page++
	}

	return keyList, nil
}
