const lighthouse = require("lighthouse");
const chromeLauncher = require("chrome-launcher");
const argv = require("yargs").argv;
const url = require("url");
const fs = require("fs");
const glob = require("glob");
const path = require("path");

const launchChromeAndRunLighthouse = url => {
  return chromeLauncher.launch().then(chrome => {
    const opts = {
      port: chrome.port
    };
    return lighthouse(url, opts).then(results => {
      return chrome.kill().then(() => {
        return {
          // return results as both json and JS object
          js: results.lhr,
          json: results.report
        };
      });
    });
  });
};

const getContents = pathStr => {
  const output = fs.readFileSync(pathStr, "utf8", (err, results) => {
    return results;
  });
  return JSON.parse(output);
};

// meaningful reports to save
const compareReports = (from, to) => {
  const metricFilter = [
    "first-contentful-paint",
    "first-meaningful-paint",
    "speed-index",
    "estimated-input-latency",
    "total-blocking-time",
    "max-potential-fid",
    "time-to-first-byte",
    "first-cpu-idle",
    "interactive"
  ];

  // math
  const calcPercentageDiff = (from, to) => {
    const per = ((to - from) / from) * 100;
    return Math.round(per * 100) / 100;
  };

  for (let auditObj in from["audits"]) {
    if (metricFilter.includes(auditObj)) {
      const percentageDiff = calcPercentageDiff(
        from["audits"][auditObj].numericValue,
        to["audits"][auditObj].numericValue
      );

      // change color based on results
      let logColor = "\x1b[37m";
      const log = (() => {
        if (Math.sign(percentageDiff) === 1) {
          logColor = "\x1b[31m";
          return `${percentageDiff.toString().replace("-", "") + "%"} slower`;
        } else if (Math.sign(percentageDiff) === 0) {
          return "unchanged";
        } else {
          logColor = "\x1b[32m";
          return `${percentageDiff.toString().replace("-", "") + "%"} faster`;
        }
      })();
      console.log(logColor, `${from["audits"][auditObj].title} is ${log}`);
    }
  }
};

if (argv.from && argv.to) {
  compareReports(
    getContents(argv.from + ".json"),
    getContents(argv.to + ".json")
  );
} else if (argv.url) {
  const urlObj = new URL(argv.url);
  let dirName = urlObj.host.replace("www.", "");

  // remove characters from url
  if (urlObj.pathname !== "/") {
    dirName = dirName + urlObj.pathname.replace(/\//g, "_");
  }

  // if the directory name doesn't already exist, make a new one
  if (!fs.existsSync(dirName)) {
    fs.mkdirSync(dirName);
  }

  launchChromeAndRunLighthouse(argv.url).then(results => {
    const prevReports = glob(`${dirName}/*.json`, {
      sync: true
    });

    if (prevReports.length) {
      dates = [];
      for (report in prevReports) {
        dates.push(
          new Date(path.parse(prevReports[report]).name.replace(/_/g, ":"))
        );
      }
      const max = dates.reduce(function(a, b) {
        return Math.max(a, b);
      });
      const recentReport = new Date(max).toISOString();

      const recentReportContents = getContents(
        dirName + "/" + recentReport.replace(/:/g, "_") + ".json"
      );

      compareReports(recentReportContents, results.js);
    }

    // create the file
    fs.writeFile(
      `${dirName}/${results.js["fetchTime"].replace(/:/g, "_")}.json`,
      results.json,
      err => {
        if (err) throw err;
      }
    );
  });
} else {
  throw "You haven't passed a URL to Lighthouse";
}

// get a report
// node lh.js --url www.keeferealestate.com

// compare two reports 
// 