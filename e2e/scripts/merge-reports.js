const { mergeHTMLReports } = require("playwright-merge-html-reports");
const fs = require('fs');

// Define the directory and pattern
const directory = process.cwd();
const pattern = /^playwright-report-\d+$/;

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
  const inputReportPaths = matchedDirectories.map(item => `${directory}/${item}`);

  const config = {
    outputFolderName: "merged-html-report", // default value
    outputBasePath: process.cwd() // default value
  }

  mergeHTMLReports(inputReportPaths, config);

});
