const fs = require('fs');
const content = JSON.parse(fs.readFileSync('package-lock.json', 'utf-8'));

// Skip integrity check for mattermost-webapp and mattermost-redux, which differs on Apple Silicon M1.
// @see https://github.com/npm/cli/issues/2846
delete content.dependencies['mattermost-webapp'].integrity;
delete content.dependencies['mattermost-redux'].integrity;

fs.writeFileSync('package-lock.json', JSON.stringify(content, null, 2) + '\n');
