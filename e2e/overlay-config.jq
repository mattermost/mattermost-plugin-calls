. * {
  "SqlSettings": {
    "DataSource": "postgres://mmuser:mostest@postgres:5432/mattermost_test?sslmode=disable&connect_timeout=10&binary_parameters=yes",
    "DriverName": "postgres"
  },
  # Update Elasticsearch.ConnectionURL to http://elasticsearch:9200
  "ElasticsearchSettings": {
    "ConnectionURL": "http://elasticsearch:9200"
  },
  "LdapSettings": {
    "LdapServer": "openldap"
  },
  "EmailSettings": {
    "SMTPServer": "inbucket"
  },
  # Disable automatic installation of prepackaged plugins
  "PluginSettings": {
    "EnableUploads": true,
    "AutomaticPrepackagedPlugins": false,
    "Plugins": {
      "com.mattermost.calls": {
        "icehostoverride": "",
        "iceserversconfigs": "",
        "enablerecordings": true,
        "defaultenabled": true,
        "jobserviceurl": "http://calls-offloader:4545"
      }
    }
  },
  "ServiceSettings": {
    "SiteURL": "http://mm-server:8065",
    "EnableOnboardingFlow": false,
    # Enable local mode to allow plugin upload via mmctl --local
    # (which does not require setting up a user beforehand)
    "EnableLocalMode": true,
    # Since MM-52898 we need to explicitly allow localhost given the siteURL
    # host is different (mm-server).
    "AllowCorsFrom": "http://localhost:8065",
    "EnableDeveloper": true,
    "EnableTesting": true
  },
  "ClusterSettings": {
    "ReadOnlyConfig": false
  },
  # Disable in product notices to avoid random failures due to prompts appearing.
  "AnnouncementSettings": {
    "UserNoticesEnabled": false,
    "AdminNoticesEnabled": false
  },
  "FeatureFlags": {
    "CallsEnabled": true
  },
  "ExperimentalSettings": {
    "DisableAppBar": false
  },
  "LogSettings": {
    "ConsoleLevel": "DEBUG",
    "FileLevel": "DEBUG"
  }
}
