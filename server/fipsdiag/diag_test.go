// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package fipsdiag

import (
	"bufio"
	"crypto/fips140"
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"fmt"
	"hash"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strings"
	"testing"

	"github.com/lib/pq/scram"
)

func try(t *testing.T, name string, f func() string) {
	t.Helper()
	defer func() {
		if r := recover(); r != nil {
			t.Logf("%-55s PANIC: %v", name, strings.ReplaceAll(fmt.Sprint(r), "\n", " | "))
		}
	}()
	t.Logf("%-55s ok %s", name, f())
}

func TestFIPSDiag(t *testing.T) {
	t.Logf("runtime.Version: %s", runtime.Version())
	t.Logf("fips140.Enabled: %v", fips140.Enabled())
	if bi, ok := debug.ReadBuildInfo(); ok {
		for _, s := range bi.Settings {
			t.Logf("build setting %s=%s", s.Key, s.Value)
		}
	}
	for _, k := range []string{"OPENSSL_CONF", "OPENSSL_MODULES", "GODEBUG", "GOFIPS", "GOFIPS140", "GOLANG_FIPS", "EXPECT_FIPS"} {
		v, ok := os.LookupEnv(k)
		t.Logf("env %s=%q (set=%v)", k, v, ok)
	}

	// Initialize the crypto backend before inspecting libcrypto.
	_ = sha256.Sum256([]byte("init"))

	for _, line := range strings.Split(OpenSSLReport(), "\n") {
		if line != "" {
			t.Logf("openssl: %s", line)
		}
	}

	if f, err := os.Open("/proc/self/maps"); err == nil {
		seen := map[string]bool{}
		sc := bufio.NewScanner(f)
		for sc.Scan() {
			fields := strings.Fields(sc.Text())
			if len(fields) < 6 {
				continue
			}
			p := fields[5]
			if !seen[p] && (strings.Contains(p, "crypto") || strings.Contains(p, "ssl") || strings.Contains(p, "fips") || strings.Contains(p, "ossl")) {
				seen[p] = true
				t.Logf("mapped: %s", p)
			}
		}
		f.Close()
	}

	var cnfs []string
	for _, pat := range []string{"/etc/ssl/*.cnf", "/etc/ssl/*/*.cnf", "/usr/ssl/*.cnf", "/usr/local/ssl/*.cnf", "/usr/lib/ssl*/*.cnf", "/etc/pki/tls/*.cnf", "/usr/lib/ossl-modules/*", "/usr/lib64/ossl-modules/*"} {
		m, _ := filepath.Glob(pat)
		cnfs = append(cnfs, m...)
	}
	for _, p := range cnfs {
		if strings.HasSuffix(p, ".so") {
			t.Logf("file: %s", p)
			continue
		}
		b, err := os.ReadFile(p)
		if err != nil {
			t.Logf("file: %s (%v)", p, err)
			continue
		}
		var keep []string
		for _, l := range strings.Split(string(b), "\n") {
			l = strings.TrimSpace(l)
			if l != "" && !strings.HasPrefix(l, "#") && !strings.HasPrefix(l, "module-mac") && !strings.HasPrefix(l, "install-mac") && !strings.HasPrefix(l, "install-status") {
				keep = append(keep, l)
			}
		}
		t.Logf("file: %s:\n    %s", p, strings.Join(keep, "\n    "))
	}

	hashes := []struct {
		name string
		h    func() hash.Hash
	}{{"sha1", sha1.New}, {"sha256", sha256.New}, {"sha512", sha512.New}}
	keys := []string{"", "mostest", "short-key", "thirteen-byte", "fourteen-bytes"}
	for _, h := range hashes {
		for _, k := range keys {
			try(t, fmt.Sprintf("hmac.New(%s, %d-byte key)+Write+Sum", h.name, len(k)), func() string {
				m := hmac.New(h.h, []byte(k))
				m.Write([]byte("data"))
				return fmt.Sprintf("%T %x", m, m.Sum(nil)[:4])
			})
		}
	}

	salt := []byte("0123456789abcdef")
	try(t, "lib/pq saltPassword loop (sha256, mostest, 4096)", func() string {
		m := hmac.New(sha256.New, []byte("mostest"))
		m.Write(salt)
		m.Write([]byte{0, 0, 0, 1})
		ui := m.Sum(nil)
		for i := 1; i < 4096; i++ {
			m.Reset()
			m.Write(ui)
			ui = m.Sum(ui[:0])
		}
		return fmt.Sprintf("%x", ui[:4])
	})
	try(t, "lib/pq scram.Client with mostest", func() string {
		c := scram.NewClient(sha256.New, "mmuser", "mostest")
		c.SetNonce([]byte("clientnonce"))
		c.Step(nil)
		server := fmt.Sprintf("r=clientnonceservernonce,s=%s,i=4096", base64.StdEncoding.EncodeToString(salt))
		c.Step([]byte(server))
		return fmt.Sprintf("out=%q err=%v", c.Out(), c.Err())
	})
	try(t, "pbkdf2.Key(sha256, mostest, 16-byte salt, 4096, 32)", func() string {
		k, err := pbkdf2.Key(sha256.New, "mostest", salt, 4096, 32)
		return fmt.Sprintf("len=%d err=%v", len(k), err)
	})
}
