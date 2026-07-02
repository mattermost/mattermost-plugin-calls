// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */

// The report workflow copies this script into a temporary artifact directory in CI,
// installs packages listed below, and runs it directly with Node.
const {mergeHTMLReports} = require('playwright-merge-html-reports');
const fs = require('fs');

// Define the directory and pattern
const directory = process.cwd();
const pattern = /^playwright-report-(core-)?\d+$/;

// Function to filter directories based on the pattern
function filterDirectories(item) {
    return fs.statSync(item).isDirectory() && pattern.test(item);
}

// List directories and count them
fs.readdir(directory, (err, items) => {
    if (err) {
        console.error('Error:', err);
        return;
    }

    // Filter directories based on the pattern
    const matchedDirectories = items.filter(filterDirectories);

    // List to store directory paths
    const inputReportPaths = matchedDirectories.map((item) => `${directory}/${item}`);

    console.log(items, matchedDirectories, inputReportPaths);

    const config = {
        outputFolderName: 'merged-html-report', // default value
        outputBasePath: process.cwd(), // default value
    };

    mergeHTMLReports(inputReportPaths, config);
});
