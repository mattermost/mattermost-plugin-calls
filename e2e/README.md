# e2e caveats

- `make test-data` in `mattermost-server` to create the standard test sysadmin (u: sysadmin, pw: Sys@dmin-sample1) prior to running tests

- snapshots were updated with the new App Bar (`config.ExperimentalSettings.EnableAppBar: true`) enabled, tests likely will fail if you have it disabled

- server should have an enterprise license applied
