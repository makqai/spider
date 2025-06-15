const { connectToDatabase } = require('./db/database'); // Import the database module
const logger = require('./utils/logger');
const { scrapePages } = require('../src/scrape');
require('dotenv').config();

// Function to process jobs
module.exports = async (job) => {
    let db;
    try {
        // Example of logging a job processing
        logger.verbose(`Processing job ${job.data.sqId} for client ${job.data.clientId}`);
        db = await connectToDatabase();        

        try {

            // Update job status in the database to 'running'
            await db.query(`UPDATE spider_queue SET state = 'running', started_dt = NOW() WHERE sq_id = ?`, [job.data.sqId]);
            
            logger.debug(`sqId: ${job.data.sqId}, url: ${job.data.url}, clientId: ${job.data.clientId}, isSinglePage: ${job.data.is_single_page}, retries: ${job.data.retries}, reCrawling: ${job.data.recrawling}`);

            const [linkCounts, isSaved] = await scrapePages(
                job.data.url,
                +process.env.URL_PER_DOMAIN || 25000,
                +process.env.ENABLE_PROXY || 0,
                +process.env.ENABLE_CAPSOLVER || 0,
                process.env.PROXY_URL,
                +process.env.CAPSOLVER_TIMEOUT_MS || 60000,
                async capInsertVisitedLinks => {
                    try {
                        for (const link of capInsertVisitedLinks) {                        
                            await db.query(
                                `INSERT INTO spider_url (sq_id, url, hash, status) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE sq_id = ?, hash = ?, status = ?`,
                                [
                                    job.data.sqId,
                                    link.url,
                                    link.hash,
                                    'completed',
                                    job.data.sqId,
                                    link.hash,
                                    'completed'
                                ]
                            );
                        }
                        await db.query(`CALL spiderV2_import_queue_item(${job.data.sqId})`);
                    } catch (error) {
                        logger.error(error.stack);                        
                    }                    
                },
                +process.env.INSERT_CAPPING_THRESHOLD || 100,
                +process.env.DYNAMIC_USERAGENT || 0,
                process.env.GOOGLE_CHROME_LOCATION || '/usr/bin/google-chrome',
                process.env.PAGE_SAVE_LOCATION || '/tmp',
                +job.data.recrawling,
                +job.data.autoscroll, /* Auto Scroll */
                job.data.sqId
            );

            const sqId = job.data.sqId;

            if (+job.data.is_single_page === 0 && linkCounts === 1) {
                const retries = +job.data.retries;

                if (retries >= +process.env.NON_SPA_RETRIES) {
                    await updateQueue(db, 'failed', sqId);
                    logger.error(`Failed job ${sqId}`);
                } else {
                    const newRetries = retries + 1;
                    await updateQueue(db, 'pending', sqId, newRetries);
                    logger.warn(`Putting pending job ${sqId}`);
                }
            } else if (!isSaved) {
                await updateQueue(db, 'failed', sqId);
                logger.verbose(`Failed job ${sqId}`);
            }
        } catch (error) {
            logger.error(`spider.js(failed): ${error}`);            
            // Update job status in the database to 'failed'
            await db.query(`UPDATE spider_queue SET state = 'failed' WHERE sq_id = ?`, [job.data.sqId]);            
        } finally {
            db.end();
        }
    } catch (error) {
        // Example of logging an error
        logger.error(`Error processing job ${job.data.sqId}: ${error}`);        
    }
};

async function updateQueue(db, state, sqId, newRetries) {
    let query;
    if (state === 'failed') {
        query = `UPDATE spider_queue SET state = 'failed' WHERE sq_id = ${sqId}`;
    } else if (state === 'pending') {
        query = `UPDATE spider_queue SET state = 'pending', spider_pid = NULL, retries = ${newRetries} WHERE sq_id = ${sqId}`;
    } else if (state === 'complete') {
        query = `UPDATE spider_queue SET state = 'complete', completed_dt = NOW() WHERE sq_id = ${sqId}`;
    }

    await db.query(query);
}