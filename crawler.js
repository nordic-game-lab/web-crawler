#!/usr/bin/env node
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const yargs = require('yargs');
const { URL } = require('url');
const RobotsParser = require('robots-parser');
const puppeteer = require('puppeteer');

const {RUNNING_IN_DOCKER} = process.env;
const puppeteerArgs = RUNNING_IN_DOCKER ? ['--no-sandbox', '--disable-setuid-sandbox'] : [];

let crawledUrls = [];
let pageData = [];

async function crawl(toCrawlUrl, urlInclude, noCrawl) {
  let toCrawlUrls = [
    toCrawlUrl
  ];
  const browser = await puppeteer.launch({args: puppeteerArgs});
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({"From": "bots(at)nordicgamelab.org"})
    while (toCrawlUrls.length > 0) {
        const url = toCrawlUrls.pop();
        crawledUrls.push(url);

      const userAgentToken = 'Mozilla/5.0 (compatible; NordicGameLabBot/1.0; +https://docs.nordicgamelab.org/projects/nordic-game-lab-bot/)';
      var pathArray = url.split( '/' );
      var baseurl = pathArray[0] + '//' + pathArray[2];

      const robotsTxtUrl = new URL('/robots.txt', baseurl);
      const robotsTxtResponse = await axios.get(robotsTxtUrl)

      // Parse the robots.txt content (you can use a library like 'robots-parser')
      const robotsTxtContent = robotsTxtResponse.data;
      const robotsParser = new RobotsParser(robotsTxtContent);

      await page.setUserAgent(userAgentToken);
      


      function containsValueFromArray(str, arr) {
          return arr.some(element => str.includes(element));
      }

        // Exclude URLs that include cdn-cgi
        if (robotsParser.isAllowed(userAgentToken, url)) {
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded' });
                const content = await page.content();
                const $ = cheerio.load(content);
                $('a').each((index, element) => {
                    let href = $(element).attr('href');
                    if (href && !containsValueFromArray(href, noCrawl)) {
                        // Handle relative URLs
                        if (href.startsWith('/')) {
                            href = new URL(href, url).href;
                        }
                        if (href.includes(urlInclude) && !crawledUrls.includes(href) && !toCrawlUrls.includes(href)) {
                            console.log(href);
                            toCrawlUrls.push(href); // Add the found URL to the list of URLs to crawl
                        }
                    } else {
                        if(href.includes('zoho')){
                          console.log(href);
                          toCrawlUrls.push(href); // Add the found URL to the list of URLs to crawl
                        }else{
                          if(href && !href.startsWith('/')){
                              console.log('Url on noCrawl list: ' + href);
                          }
                        }
                    }
                });

              // Extract meta tag content
                const title = $('meta[property="og:title"]').attr('content');
                const description = $('meta[name="description"]').attr('content');
                pageData.push({ 'url': url, 'title': title, 'description': description });

            } catch (error) {
                console.error(`Error occurred while crawling ${url}: ${error}`);
            }
        } else {
          console.log(`URL blocked by robots.txt: ${url}`);
        }
    }
    await browser.close();
    return pageData;
  
}

// Parse command-line arguments
const argv = yargs
    .option('config', {
        alias: 'c',
        description: 'Path to the config.js file',
        type: 'string',
        demandOption: true,
    })
    .help()
    .argv;

// Read the config.js file
const configPath = path.resolve(argv.config);
try {
    const config = require(configPath);
    const { toCrawlUrl, urlInclude, noCrawl } = config;

    // Call the crawl function with the provided configuration
    crawl(toCrawlUrl, urlInclude, noCrawl);
} catch (error) {
    console.error(`Error reading or parsing config.js: ${error.message}`);
}