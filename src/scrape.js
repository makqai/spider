const logger = require('./utils/logger');
const puppeteer = require('puppeteer-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');
const { mimeTypes } = require('./utils/mime');
const UserAgent = require('user-agents');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const fs = require('fs/promises');
const { existsSync, unlinkSync } = require('fs');
const { parse } = require('../lib/node-html-parser/dist/index');
const { v4: uuidv4 } = require('uuid');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const { getReCrawlingLinks } = require('./db/database');

puppeteer.use(stealthPlugin());
puppeteer.use(AdblockerPlugin());

let isBrowserOpen = false;
let isSaved = false;
let browser = null;
async function scrapePages(startURL, urlPerDomain = 25000, enableProxy = 0,
    enableCaptcha = 0, proxyURL = '', captchaTimeout = 60000,
    capInsertCallback = null, capInsertThreshold = 100, enableDynamicUserAgent = 0,
    googleChromeLocation = '', saveLocation = '/tmp', isRecrawling = 0, autoScrollEnabled = 0, sqId = null) {
    try {
        startURL = sanitizeURL(startURL);
        const puppeteerArgs = [
            '--lang=en',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ];

        if (+enableProxy) {
            puppeteerArgs.push(`--proxy-server=${proxyURL}`);
        }

        if (+enableCaptcha) {
            const pathToExtension = require('path').join(process.cwd(), '../capsolver');
            puppeteerArgs.push(`--disable-extensions-except=${pathToExtension}`);
            puppeteerArgs.push(`--load-extension=${pathToExtension}`);
        }

        browser = await puppeteer.launch({
            headless: 'new',
            args: puppeteerArgs,
            ignoreDefaultArgs: ['--enable-automation'],
            executablePath: googleChromeLocation
        });
        isBrowserOpen = true;

        const visitedLinks = new Set();
        let capInsertVisitedLinks = [];
        const toBeVisitedLinks = [];
        let page = null;
        let originalURL = '';
        let currentURL = '';
        let HTMLBody = '';

        if (isRecrawling) {
            const links = await getReCrawlingLinks(sqId);
            for (let index = 0; index < links.length; index++) {
                if (links[index].url !== undefined) {
                    toBeVisitedLinks.push(links[index].url);
                }                    
            }
        } else {
            toBeVisitedLinks.push(startURL);
        }

        while (toBeVisitedLinks.length > 0) {
            try {
                originalURL = toBeVisitedLinks.pop();                
                currentURL = sanitizeURL(originalURL);
                if (visitedLinks.has(currentURL)) {
                    continue;
                }

                logger.debug(currentURL);

                page = await browser.newPage();

                if (+enableDynamicUserAgent) {
                    const userAgent = new UserAgent({ deviceCategory: 'desktop' })
                    await page.setUserAgent(userAgent.toString());
                }

                // Enable request interception
                await page.setRequestInterception(true);

                const client = await page.target().createCDPSession();

                // intercept request when response headers was received
                await client.send('Network.setRequestInterception', {
                    patterns: [{
                        urlPattern: '*',
                        resourceType: 'Document',
                        interceptionStage: 'HeadersReceived'
                    }],
                });

                await client.on('Network.requestIntercepted', async e => {
                    try {
                        let headers = e.responseHeaders || {};
                        let contentType = headers['content-type'] || headers['Content-Type'] || '';
                        let obj = { interceptionId: e.interceptionId };
                        if (mimeTypes.some(type => contentType.indexOf(type) > -1)) {
                            logger.debug(contentType);
                            obj['errorReason'] = 'BlockedByClient';
                        }
                        await client.send('Network.continueInterceptedRequest', obj);
                    } catch (error) {
                        logger.error(error.stack);
                    }
                });

                // Allow only document-related requests
                await page.on('request', (request) => {
                    try {
                        if (['document', 'script', 'xhr', 'fetch'].includes(request.resourceType())) {
                            request.continue();
                        } else {
                            request.abort();
                        }
                    } catch (error) {
                        logger.error(error.stack);
                    }
                });

                // Function to extract web links from the page
                const extractLinks = async () => {
                    let links = [];
                    let HTMLBody = '';
                    try {
                        [links, HTMLBody] = await page.evaluate((startURL) => {
                            try {
                                // Regular expression to match common file extensions
                                const fileExtensionRegex = /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|csv|rtf|odt|ods|odp|jpg|jpeg|png|gif|bmp|svg|webp|tiff|ico|mp3|wav|ogg|aac|flac|wma|m4a|mp4|avi|mkv|mov|wmv|flv|webm|mpeg|m4v|zip|rar|7z|tar|gz|bz2|xz|exe|msi|dmg|app|ttf|otf|woff|woff2|eot|json|xml|py|java|cpp|c|h|rb|pl|sql|yaml|sh)$/i;
                                const origin = (new URL(startURL)).origin;
                                const anchorElements = document.querySelectorAll('a'); // Change the selector based on your target elements                
                                const links = Array.from(anchorElements).filter(anchor => {
                                    return anchor.href.startsWith(origin) && !fileExtensionRegex.test(anchor.href) && !anchor.href.includes('wp-admin');
                                }).map(anchor => {
                                    return anchor.href;
                                });
                                return [links, document.body.innerHTML];
                            } catch (error) {
                                console.error(error);
                            }

                        }, startURL);
                    } catch (error) {
                        logger.error(error.stack);
                    }

                    const uniqueLinks = [...new Set(links)];

                    return [uniqueLinks, HTMLBody];
                };

                let linksOnPage = [];
                HTMLBody = '';

                // Add current URL to the visited set
                visitedLinks.add(currentURL);
                const response = await page.goto(currentURL, { timeout: 30000, waitUntil: 'domcontentloaded' });
                const httpResponseCode = response.status();
                const pageResponseOrigin = ((new URL(response.url())).origin).replace(/(^\w+:|^)\/\//, '');
                const urlFromCurrentURL = currentURL.replace(/(^\w+:|^)\/\//, '');

                if (+httpResponseCode >= 300 && +httpResponseCode <= 399 && !urlFromCurrentURL.startsWith(pageResponseOrigin)) {
                    logger.error(`Redirection response code ${httpResponseCode}\nCurrent URL: ${currentURL}\nNavigated URL: ${pageResponseOrigin}`);
                    continue;
                } else if (+httpResponseCode >= 400 && +httpResponseCode <= 499) {
                    logger.error(`Client error response code ${httpResponseCode}`);
                    continue;
                } else if (+httpResponseCode >= 500 && +httpResponseCode <= 599) {
                    logger.error(`Server error response code ${httpResponseCode}`);
                    continue;
                } 

                if (+enableCaptcha) {
                    // Check for the presence of CAPTCHA elements
                    const isRecaptchaPresent = await page.evaluate(() => {
                        return document.querySelector('.g-recaptcha') !== null ||           // reCaptcha v2
                            document.querySelector('.g-recaptcha-response') !== null ||     // reCaptcha v3
                            document.querySelector('.h-captcha') !== null                   // hCaptcha
                            ;
                    });

                    await new Promise(async (res, rej) => {
                        if (isRecaptchaPresent) {
                            logger.debug('CAPTCHA detected');

                            await page.exposeFunction("captchaResolveEvent", captchaResolveEvent);

                            // Evaluate JavaScript
                            page.evaluate(() => {
                                window.captchaSolvedCallback = function () {
                                    captchaResolveEvent();
                                };
                            });

                            function captchaResolveEvent() {
                                logger.debug('CAPTCHA resolved.');
                                clearTimeout(timeoutId); // Clear the timeout when the event fires
                                logger.debug('Waiting for 5 seconds to redirect.');
                                setTimeout(() => {
                                    res();
                                }, 5 * 1000);
                            }

                            // Set a timeout (CAPSOLVER_TIMEOUT_MS milliseconds)
                            const timeoutId = setTimeout(() => {
                                logger.debug(`Timeout: Event did not fire within ${captchaTimeout} milliseconds`);
                                rej(new Error(`Timeout: Event did not fire within ${captchaTimeout} milliseconds`));
                            }, +captchaTimeout);
                        } else {
                            logger.debug('No CAPTCHA found.');
                            res(); // Resolve immediately if the condition is not met
                        }
                    });
                }

                if (autoScrollEnabled) {
                    // Scroll down the page to load more videos
                    await autoScroll(page);
                }

                // Extract web links from the page
                [linksOnPage, HTMLBody] = await extractLinks();

                const hashId = uuidv4();
                await createFile(HTMLBody, saveLocation, hashId);

                capInsertCallback != null && capInsertVisitedLinks.push({ 'url': originalURL, 'hash': hashId });

                if (capInsertVisitedLinks.length != 0 && capInsertVisitedLinks.length == capInsertThreshold && capInsertCallback != null) {
                    logger.debug(`Cap Insert Event Occured at ${capInsertThreshold}.`);
                    await capInsertCallback([...capInsertVisitedLinks]);
                    capInsertVisitedLinks = [];
                    isSaved = true;
                }

                if (!isRecrawling) {
                    // Add new links to the to-be-visited list
                    linksOnPage.forEach(link => {
                        try {
                            link = sanitizeURL(link);
                            if (!visitedLinks.has(link) && !toBeVisitedLinks.includes(link)) {
                                toBeVisitedLinks.push(link);
                            }
                        } catch (error) {
                            logger.error(error.stack);
                        }
                    });
                }                
            } catch (error) {
                logger.error(error.stack);
            } finally {
                try {
                    logger.debug(`Going to close the page: ${currentURL}`);
                    await page.close();
                    logger.debug(`Successfully closed the page: ${currentURL}`);
                } catch (error) {
                    logger.error(error.stack);
                }

                let vListSize = visitedLinks.size;
                logger.debug("Visited Links: " + vListSize);
                if (vListSize >= +urlPerDomain) {
                    break;
                }
            }
        }

        if (capInsertVisitedLinks.length != 0 && capInsertCallback != null) {
            logger.debug(`Cap Insert Event Occured at ${capInsertVisitedLinks.length}.`);
            await capInsertCallback([...capInsertVisitedLinks]);
            capInsertVisitedLinks = [];
            isSaved = true;
        }

        // Return the set of visited links
        return [visitedLinks.size, isSaved];
    } catch (error) {
        logger.error(error.stack);
        throw error;
    } finally {
        if (browser !== null && browser !== undefined && isBrowserOpen) {
            logger.debug(`Going to close the browser.`);
            // Close the browser
            await browser.close();
            isBrowserOpen = false;
        }
    }
}

function sanitizeURL(url) {
    url = url.replace(/[/#]*$/, "");
    url = url.split('#')[0];
    if (url.slice(-1) === '/') {
        // If the last character is a slash, remove it
        url = url.slice(0, -1);
    }
    return url;
}

// Function to scroll down the page to load more content
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
            let totalHeight = 0;
            const distance = 100;
            const interval = setInterval(() => {
                const scrollHeight = document.documentElement.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= scrollHeight) {
                    clearInterval(interval);
                    resolve();
                }
            }, 1);
        });
    });
}

async function createFile(html, saveLocation, hashId) {
    const fileSavingPromise = [];
    const allFiles = [];
    const baseLocation = `${saveLocation}/${hashId.substring(0, 2)}/${hashId.substring(2, 4)}/`;
    try {
        const parsedBodyNode = parse(html, {
            lowerCaseTagName: false,  // convert tag name to lower case (hurts performance heavily)
            comment: false,            // retrieve comments (hurts performance slightly)
            voidTag: {
                tags: ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'],	// optional and case insensitive, default value is ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']
                closingSlash: true     // optional, default false. void tag serialisation, add a final slash <br/>
            },
            blockTextElements: {
                script: false,	// keep text content when parsing
                noscript: false,	// keep text content when parsing
                style: false,		// keep text content when parsing
                pre: true			// keep text content when parsing
            }
        });

        await exec(`mkdir -p ${baseLocation}`);

        const htmlFileName = `${baseLocation}${hashId}.html`
        allFiles.push(`${hashId}.html`);

        fileSavingPromise.push(fs.writeFile(htmlFileName, html, err => {
            if (err)
                logger.error(err);
            else {
                logger.debug("Body HTML file written successfully");
            }
        }));

        const txtFileName = `${baseLocation}${hashId}.txt`;
        allFiles.push(`${hashId}.txt`);

        fileSavingPromise.push(fs.writeFile(txtFileName, parsedBodyNode.compressedText, err => {
            if (err)
                logger.error(err);
            else {
                logger.debug("Compressed text file written successfully");
            }
        }));

        const jsonFileName = `${baseLocation}${hashId}.json`;
        allFiles.push(`${hashId}.json`);

        fileSavingPromise.push(fs.writeFile(jsonFileName, parsedBodyNode.textHierarchy, err => {
            if (err)
                logger.error(err);
            else {
                logger.debug("JSON structure file written successfully");
            }
        }));

        await Promise.all(fileSavingPromise);

        await compressFilesIntoBzip2Archive(baseLocation, hashId, allFiles);

    } catch (error) {
        logger.error(error.stack);
    } finally {
        allFiles.forEach(file => {
            if (existsSync(`${baseLocation}${file}`)) {
                unlinkSync(`${baseLocation}${file}`);
            }
        });
    }
}

// Function to compress files using tar and bzip2
async function compressFilesIntoBzip2Archive(path, outputFileName, filePaths) {
    const files = filePaths.join(' ');
    try {
        await exec(`cd ${path} && tar -cjf ${outputFileName}.tar.bz2 ${files}`);
        logger.debug(`Files compressed into ${outputFileName}.tar.bz2`);
    } catch (error) {
        logger.error(`Error: ${error.message}`);
    }
}

module.exports = { scrapePages };