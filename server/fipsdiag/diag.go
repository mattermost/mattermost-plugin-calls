// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

//go:build linux && cgo

// Package fipsdiag is a temporary MM-71800 diagnostic. It will be reverted.
package fipsdiag

/*
#cgo LDFLAGS: -ldl
#include <dlfcn.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
	const char *key;
	unsigned int data_type;
	void *data;
	size_t data_size;
	size_t return_size;
} param_t;

static void *lib;
static char out[65536];
static size_t outlen;

static void emit(const char *fmt, ...) {
	if (outlen >= sizeof(out) - 1) return;
	va_list ap;
	va_start(ap, fmt);
	int n = vsnprintf(out + outlen, sizeof(out) - outlen, fmt, ap);
	va_end(ap);
	if (n > 0) outlen += (size_t)n;
	if (outlen > sizeof(out) - 1) outlen = sizeof(out) - 1;
}

static void drain_errors(void) {
	unsigned long (*err_get)(void) = dlsym(lib, "ERR_get_error");
	void (*err_str)(unsigned long, char *, size_t) = dlsym(lib, "ERR_error_string_n");
	if (!err_get || !err_str) return;
	unsigned long e;
	char buf[512];
	while ((e = err_get()) != 0) {
		err_str(e, buf, sizeof(buf));
		emit("    openssl error: %s\n", buf);
	}
}

static int provider_cb(void *prov, void *arg) {
	const char *(*get0_name)(void *) = dlsym(lib, "OSSL_PROVIDER_get0_name");
	int (*get_params)(void *, param_t *) = dlsym(lib, "OSSL_PROVIDER_get_params");
	char *ver = NULL, *build = NULL, *name = NULL;
	int status = -1;
	param_t ps[5] = {
		{"name", 6, &name, sizeof(name), (size_t)-1},
		{"version", 6, &ver, sizeof(ver), (size_t)-1},
		{"buildinfo", 6, &build, sizeof(build), (size_t)-1},
		{"status", 1, &status, sizeof(status), (size_t)-1},
		{NULL, 0, NULL, 0, 0},
	};
	if (get_params) get_params(prov, ps);
	emit("provider: %s (name=%s version=%s buildinfo=%s status=%d)\n",
		get0_name ? get0_name(prov) : "?", name ? name : "?", ver ? ver : "?", build ? build : "?", status);
	return 1;
}

static void hmac_try(const char *props, const char *digest, const unsigned char *key, size_t keylen, int keycheck) {
	void *(*mac_fetch)(void *, const char *, const char *) = dlsym(lib, "EVP_MAC_fetch");
	void *(*ctx_new)(void *) = dlsym(lib, "EVP_MAC_CTX_new");
	int (*mac_init)(void *, const unsigned char *, size_t, const param_t *) = dlsym(lib, "EVP_MAC_init");
	void (*ctx_free)(void *) = dlsym(lib, "EVP_MAC_CTX_free");
	void (*mac_free)(void *) = dlsym(lib, "EVP_MAC_free");
	const void *(*mac_prov)(const void *) = dlsym(lib, "EVP_MAC_get0_provider");
	const char *(*get0_name)(const void *) = dlsym(lib, "OSSL_PROVIDER_get0_name");
	if (!mac_fetch || !ctx_new || !mac_init) { emit("EVP_MAC symbols missing\n"); return; }

	void *mac = mac_fetch(NULL, "HMAC", props);
	if (!mac) {
		emit("EVP_MAC_fetch(HMAC, props=%s) failed\n", props ? props : "NULL");
		drain_errors();
		return;
	}
	void *ctx = ctx_new(mac);
	char dg[32];
	snprintf(dg, sizeof(dg), "%s", digest);
	int kc = keycheck;
	param_t ps[3];
	int i = 0;
	ps[i++] = (param_t){"digest", 4, dg, strlen(dg), (size_t)-1};
	if (keycheck >= 0) ps[i++] = (param_t){"key-check", 1, &kc, sizeof(kc), (size_t)-1};
	ps[i] = (param_t){NULL, 0, NULL, 0, 0};
	int rc = mac_init(ctx, key, keylen, ps);
	char kcs[8];
	if (keycheck >= 0) snprintf(kcs, sizeof(kcs), "%d", keycheck); else snprintf(kcs, sizeof(kcs), "unset");
	emit("EVP_MAC_init(props=%s, digest=%s, keylen=%zu, key-check=%s) provider=%s -> %s\n",
		props ? props : "NULL", digest, keylen, kcs,
		(mac_prov && get0_name) ? get0_name(mac_prov(mac)) : "?", rc == 1 ? "OK" : "FAILED");
	drain_errors();
	if (ctx_free) ctx_free(ctx);
	if (mac_free) mac_free(mac);
}

static const char *report(void) {
	outlen = 0;
	out[0] = 0;
	const char *names[] = {"libcrypto.so.3", "libcrypto.so", NULL};
	for (int i = 0; names[i] && !lib; i++) {
		lib = dlopen(names[i], RTLD_NOW | RTLD_NOLOAD);
		if (lib) emit("dlopen(%s, NOLOAD): already loaded\n", names[i]);
	}
	for (int i = 0; names[i] && !lib; i++) {
		lib = dlopen(names[i], RTLD_NOW);
		if (lib) emit("dlopen(%s): loaded fresh (backend had not loaded it)\n", names[i]);
	}
	if (!lib) { emit("dlopen libcrypto failed: %s\n", dlerror()); return out; }

	const char *(*version)(int) = dlsym(lib, "OpenSSL_version");
	if (version) {
		emit("OpenSSL_version: %s\n", version(0));
		emit("OPENSSL_DIR: %s\n", version(4));
		emit("MODULES_DIR: %s\n", version(8));
		emit("BUILT_ON: %s\n", version(2));
	}
	char *(*conf_file)(void) = dlsym(lib, "CONF_get1_default_config_file");
	if (conf_file) { char *f = conf_file(); emit("default config file: %s\n", f ? f : "NULL"); }
	int (*is_fips)(void *) = dlsym(lib, "EVP_default_properties_is_fips_enabled");
	if (is_fips) emit("EVP_default_properties_is_fips_enabled: %d\n", is_fips(NULL));
	int (*avail)(void *, const char *) = dlsym(lib, "OSSL_PROVIDER_available");
	if (avail) emit("OSSL_PROVIDER_available fips=%d default=%d base=%d\n", avail(NULL, "fips"), avail(NULL, "default"), avail(NULL, "base"));
	int (*do_all)(void *, int (*)(void *, void *), void *) = dlsym(lib, "OSSL_PROVIDER_do_all");
	if (do_all) do_all(NULL, provider_cb, NULL);

	const unsigned char k7[] = "mostest";
	const unsigned char k9[] = "short-key";
	const unsigned char k14[] = "fourteen-bytes";
	hmac_try(NULL, "SHA256", k7, 7, -1);
	hmac_try(NULL, "SHA256", k7, 7, 0);
	hmac_try(NULL, "SHA256", k7, 7, 1);
	hmac_try(NULL, "SHA256", k9, 9, -1);
	hmac_try(NULL, "SHA256", k14, 14, -1);
	hmac_try("fips=yes", "SHA256", k7, 7, -1);
	hmac_try("fips=yes", "SHA256", k7, 7, 0);
	hmac_try("provider=default", "SHA256", k7, 7, -1);
	drain_errors();
	return out;
}
*/
import "C"

// OpenSSLReport describes the libcrypto loaded in this process and how its
// HMAC behaves with short keys.
func OpenSSLReport() string {
	return C.GoString(C.report())
}
