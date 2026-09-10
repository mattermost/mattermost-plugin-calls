// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"compress/zlib"
	"errors"
	"fmt"
	"io"
	"math"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/i18n"

	"github.com/Masterminds/semver"
)

const (
	channelNameMaxLength = 24
)

// filenameSanitizationRE matches any character NOT in the allowlist.
// This prevents Markdown/HTML injection when filenames are embedded in Markdown.
var filenameSanitizationRE = regexp.MustCompile(`[^a-zA-Z0-9._\-]`)

func (p *Plugin) getNotificationNameFormat(userID string) string {
	config := p.API.GetConfig()
	if config == nil {
		p.LogError("failed to get config")
		return model.ShowUsername
	}

	if config.PrivacySettings.ShowFullName == nil || !*config.PrivacySettings.ShowFullName {
		return model.ShowUsername
	}

	if preferences, appErr := p.API.GetPreferencesForUser(userID); appErr == nil {
		for _, pref := range preferences {
			if pref.Category == model.PreferenceCategoryDisplaySettings && pref.Name == model.PreferenceNameNameFormat {
				return pref.Value
			}
		}
	}

	return *config.TeamSettings.TeammateNameDisplay
}

func (p *Plugin) canSendPushNotifications(config *model.Config, license *model.License) error {
	if config == nil ||
		config.EmailSettings.SendPushNotifications == nil ||
		!*config.EmailSettings.SendPushNotifications {
		return nil
	}

	if config.EmailSettings.PushNotificationServer == nil {
		return nil
	}
	pushServer := *config.EmailSettings.PushNotificationServer
	if pushServer == model.MHPNS && (license == nil || !*license.Features.MHPNS) {
		return errors.New("push notifications have been disabled. Update your license or go to System Console > Environment > Push Notification Server to use a different server")
	}

	return nil
}

func getChannelNameForNotification(channel *model.Channel, sender *model.User, users []*model.User, nameFormat, excludeID string) string {
	switch channel.Type {
	case model.ChannelTypeDirect:
		return sender.GetDisplayNameWithPrefix(nameFormat, "@")
	case model.ChannelTypeGroup:
		var names []string
		for _, user := range users {
			if user.Id != excludeID {
				names = append(names, user.GetDisplayName(nameFormat))
			}
		}

		sort.Strings(names)

		return strings.Join(names, ", ")
	default:
		return channel.DisplayName
	}
}

func unpackSDPData(data []byte) ([]byte, error) {
	buf := bytes.NewBuffer(data)
	rd, err := zlib.NewReader(buf)
	if err != nil {
		return nil, fmt.Errorf("failed to create reader: %w", err)
	}
	unpacked, err := io.ReadAll(rd)
	if err != nil {
		return nil, fmt.Errorf("failed to read data: %w", err)
	}
	return unpacked, nil
}

func parseURL(u string) (string, string, string, error) {
	parsed, err := url.Parse(u)
	if err != nil {
		return "", "", "", fmt.Errorf("failed to parse URL: %w", err)
	}

	clientID := parsed.User.Username()
	authKey, _ := parsed.User.Password()
	parsed.User = nil

	return parsed.String(), clientID, authKey, nil
}

func secondsSinceTimestamp(ts int64) int64 {
	return int64(math.Round(time.Since(time.Unix(ts, 0)).Seconds()))
}

func checkMinVersion(minVersion, currVersion string) error {
	minV, err := semver.NewVersion(minVersion)
	if err != nil {
		return fmt.Errorf("failed to parse minVersion: %w", err)
	}

	currV, err := semver.NewVersion(currVersion)
	if err != nil {
		return fmt.Errorf("failed to parse currVersion: %w", err)
	}

	if cmp := currV.Compare(minV); cmp < 0 {
		return fmt.Errorf("current version (%s) is lower than minimum supported version (%s)", currVersion, minVersion)
	}

	return nil
}

func mapKeys[K comparable, V any](m map[K]V) []K {
	keys := make([]K, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

func sanitizeFilename(name string) string {
	return filenameSanitizationRE.ReplaceAllString(name, "_")
}

func truncateString(s string, length int) string {
	if utf8.RuneCountInString(s) <= length {
		return s
	}

	return fmt.Sprintf(fmt.Sprintf("%%.%ds…", length), s)
}

func (p *Plugin) genFilenameForCall(channelID string) (filename string) {
	name := channelID
	filename = fmt.Sprintf("Call_%s_%s", name, time.Now().UTC().Format("2006-01-02_15-04-05"))

	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		p.LogError("failed to get channel", "err", appErr.Error())
		return
	}

	switch channel.Type {
	case model.ChannelTypeOpen, model.ChannelTypePrivate:
		name = channel.DisplayName
	case model.ChannelTypeDirect, model.ChannelTypeGroup:
		users, appErr := p.API.GetUsersInChannel(channel.Id, model.ChannelSortByUsername, 0, 8)
		if appErr != nil {
			p.LogError("failed to get channel users", "err", appErr.Error())
			return
		}

		cfg := p.API.GetConfig()
		if cfg == nil {
			p.LogError("failed to get configuration")
			return
		}

		nameFormat := model.ShowUsername
		if cfg.PrivacySettings.ShowFullName != nil && *cfg.PrivacySettings.ShowFullName {
			nameFormat = model.ShowFullName
		}

		// We simply concatenate all the members display names separated by a dash.
		name = ""
		for i, u := range users {
			name += u.GetDisplayName(nameFormat)
			if i != len(users)-1 {
				name += "-"
			}
		}
	}

	// Hard truncating long names at channelNameMaxLength for now.
	// In the future we can be a bit more clever if needed.
	name = truncateString(name, channelNameMaxLength)

	filename = sanitizeFilename(fmt.Sprintf("Call_%s_%s", strings.ReplaceAll(name, " ", "_"), time.Now().UTC().Format("2006-01-02_15-04-05")))

	return
}

func getUserIDsFromSessions(sessions map[string]*public.CallSession) []string {
	var userIDs []string
	dedup := map[string]bool{}
	for _, session := range sessions {
		if !dedup[session.UserID] {
			userIDs = append(userIDs, session.UserID)
			dedup[session.UserID] = true
		}
	}
	return userIDs
}

// sipParticipantsRemain reports whether any SIP participant session is still present.
func sipParticipantsRemain(sessions map[string]*public.CallSession) bool {
	for _, session := range sessions {
		if session.IsSIPParticipant {
			return true
		}
	}
	return false
}

// onlySIPParticipantsRemain reports whether there is at least one session left
// and every remaining session is a SIP participant (i.e. no humans remain).
func onlySIPParticipantsRemain(sessions map[string]*public.CallSession) bool {
	if len(sessions) == 0 {
		return false
	}
	for _, session := range sessions {
		if !session.IsSIPParticipant {
			return false
		}
	}
	return true
}

func (p *Plugin) getTranslationFunc(locale string) i18n.TranslateFunc {
	if locale != "" {
		return i18n.GetUserTranslations(locale)
	}

	locale = "en"
	cfg := p.API.GetConfig()
	if cfg == nil {
		p.LogError("failed to get configuration")
	} else if cfg.LocalizationSettings.DefaultClientLocale != nil {
		locale = *cfg.LocalizationSettings.DefaultClientLocale
	}

	return i18n.GetUserTranslations(locale)
}

// humanParticipantsRemain reports whether any session other than the bot's is
// still in the call. Recording and transcribing bots do not keep a call alive:
// once the last human leaves there is nothing left to record. SIP participants
// do count — a phone caller is a real participant.
func humanParticipantsRemain(sessions map[string]*public.CallSession, botID string) bool {
	for _, session := range sessions {
		if session.UserID != botID {
			return true
		}
	}
	return false
}

// confirmedSessionCount returns how many sessions LiveKit has confirmed as
// connected. Zero is also the test for whether the room exists, since LiveKit
// creates it when the first participant connects, and one means the caller is
// looking at that first participant.
func confirmedSessionCount(sessions map[string]*public.CallSession) int {
	var n int
	for _, s := range sessions {
		if s.ConfirmedAt > 0 {
			n++
		}
	}
	return n
}

// markCallDirtyOnFirstParticipant seeds the LiveKit room metadata when the room
// first has someone in it to receive it.
//
// Metadata is otherwise only published on change, so a call whose host was
// settled by the token endpoint and never changed again would have none. The
// seed cannot happen any earlier: a room with no confirmed participant has
// nothing to publish to. It must not happen on every join either — LiveKit fans
// each metadata update out to every client in the room, so seeding per join
// would make a burst join quadratic in identical payloads, and every publish
// takes the channel lock the joins are contending for. Later joiners get the
// metadata on connect.
//
// The caller must hold the channel lock and have confirmed its own session.
func (p *Plugin) markCallDirtyOnFirstParticipant(state *callState, channelID string) {
	if confirmedSessionCount(state.sessions) == 1 {
		p.markCallDirty(channelID)
	}
}
