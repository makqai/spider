const { program } = require('commander');

program
    .option('-u, --url <url>', 'Start URL')
    .option('-d, --per-domain <number>', 'URLs per domain', 5000)
    .option('-p, --proxy <number>', 'Proxy', 0)
    .option('-c, --captcha <number>', 'Captcha', 0)
    .option('--proxy-url <url>', 'Proxy URL', 'http://dc.smartproxy.com:10000')
    .option('--captcha-timeout <number>', 'Captcha Timeout', 60000)
    .option('-t, --data-insert-threshold <number>', 'Data insert threshold', 100)
    .option('--dynamic-user-agent <number>', 'Dynamic user agent', 0)
    .option('--chrome-location <path>', 'Google Chrome location', '/usr/bin/google-chrome')    
    .option('--save-location <path>', 'Save location', '/tmp')
    .option('-r, --re-crawling-flag <number>', 'Re-Crawling flag', 0)
    .option('-a, --auto-scroll-flag <number>', 'Auto scroll flag', 0)
    .option('-q, --spider-queue-id <number>', 'Spider queue id', null)
    .option('-l, --logging-flag <level>', 'Logging flag level', 'debug')
    .parse(process.argv);

const options = program.opts();

if (!options.url) {
    console.error('No start URL provided. Exiting...');
    process.exit(1);
}

process.env.LOGGER_LEVEL=options.loggingFlag;
const { scrapePages } = require('./src/scrape')

scrapePages(
    options.url,                          // Start URL
    +options.perDomain,                   // URL per domain
    +options.proxy,                       // Proxy
    +options.captcha,                     // Captcha
    options.proxyUrl,                     // Proxy URL
    +options.captchaTimeout,              // Captcha Timeout
    capInsertVisitedLinks => {
        console.log(capInsertVisitedLinks);
    },                                    // Data insert callback
    +options.dataInsertThreshold,         // Data insert threshold
    +options.dynamicUserAgent,            // Dynamic user agent
    options.chromeLocation,               // Google Chrome location    
    options.saveLocation,                 // Save location
    +options.reCrawlingFlag,              // Re-crawling flag
    +options.autoScrollFlag,              // Auto scroll flag
    +options.spiderQueueId                //  
)
    .then(([linkCounts, isSaved]) => {
        console.log('Number of Scraped Links:', linkCounts);
        console.log('It has been saved:', isSaved);
    })
    .catch((error) => {
        console.error('Error in scraping:', error.message);
    });