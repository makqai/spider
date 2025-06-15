const { spiderPriorityJobQueue } = require('./src/queue/jobQueue');
const logger = require('./src/utils/logger');
const { connectToDatabase } = require('./src/db/database'); // Import the database module
const util = require('util');
const exec = util.promisify(require('child_process').exec);
require('dotenv').config()

// Object to track the number of jobs processed per client
const clientJobCount = {};
const spider_version = 2.0;

spiderPriorityJobQueue.on('global:completed', async jobId => {
    logger.verbose(`Spider Priority Job ${jobId} completed!`);
    const job = await spiderPriorityJobQueue.getJob(jobId);
    clientJobCount[job.data.clientId] -= 1;
    logger.verbose(`Client job done and status is: ${clientJobCount[job.data.clientId]}`);
    job.remove();
})

spiderPriorityJobQueue.on('failed', async (job, error) => {
    logger.error(`Job ${job.id} Failed with error: ${error}`);
});

spiderPriorityJobQueue.on('stalled', function (job) {
    logger.error(`Job ${job.id} has been stalled.`);
});

spiderPriorityJobQueue.on('lock-extension-failed', function (job, error) {
    logger.error(`Job ${job.id} Lock Extension Failed with error: ${error}`);
});

// Function to update job count for a client
const updateClientJobCount = (clientId) => {
    if (clientJobCount[clientId]) {
        clientJobCount[clientId] += 1;
    } else {
        clientJobCount[clientId] = 1;
    }
};

// Function to calculate job priority
const calculateJobPriority = (clientId) => {
    // The lower the job count, the higher the priority (return smaller numbers for higher priority)
    return clientJobCount[clientId] ? clientJobCount[clientId] : 0;
};

// Modified function to add jobs to the queue with priority
const addJobToQueue = async (spiderJobData) => {
    try {
        const priority = calculateJobPriority(spiderJobData.clientId);
        await spiderPriorityJobQueue.add(spiderJobData, { priority: priority + 1, removeOnComplete: false });
        logger.verbose(`Job added to the queue with priority ${priority + 1}`);
        updateClientJobCount(spiderJobData.clientId);
    } catch (error) {
        logger.error(`Error adding job to the queue: ${error}`);
    }
};

// Function to fetch jobs from the database and add them to the queue
const fetchAndQueueJobs = async () => {
    try {
        const db = await connectToDatabase();
        const nonZeroClientIds = Object.keys(clientJobCount).filter(clientId => clientJobCount[clientId] !== 0);
        const inClause = nonZeroClientIds.length > 0 ? ` AND client_id NOT IN (${nonZeroClientIds.join(',')})` : '';
        const getJobSQL = `
            SELECT s.sq_id, s.client_id, s.entry_points, s.is_single_page, s.retries, s.recrawling, s.autoscroll
            FROM   (
                        SELECT sq_id, client_id, entry_points, is_single_page, retries, recrawling, autoscroll, Row_number() OVER ( partition BY client_id ORDER BY sq_id DESC) AS row_num
                        FROM   spider_queue
                        WHERE  active = 1
                                AND state = 'pending'
                                AND spider_pid IS NULL
                                AND spider = 2
                                ${inClause}
                    ) AS s
                    JOIN (
                            SELECT client_id, Count(*) AS spider_queue_count
                            FROM   spider_queue
                            WHERE  active = 1
                                    AND state = 'pending'
                                    AND spider_pid IS NULL
                                    AND spider = 2
                                    ${inClause}
                            GROUP  BY client_id
                        ) AS sp
            ON s.client_id = sp.client_id
            WHERE  s.row_num <= ${process.env.QUEUE_PER_CLIENT}; 
        `
        const [rows] = await db.query(getJobSQL);

        if (rows.length > 0) {
            // Extract all sq_id values from the fetched records
            const sqIds = rows.map(row => row.sq_id);
            // Execute the update query
            await db.query(`UPDATE spider_queue SET spider_pid = '${process.pid}', spider_version = '${spider_version}' WHERE sq_id IN (${sqIds.join(',')})`);
            rows.forEach(job => addJobToQueue({ sqId: job.sq_id, clientId: job.client_id, url: job.entry_points, is_single_page: job.is_single_page, retries: job.retries, recrawling: job.recrawling, autoscroll: job.autoscroll }));
        }
        db.end();
    } catch (error) {
        logger.error(`Error fetching jobs from the database: ${error}`);
    }
};



(async () => {
    // Your async code here
    await exec(`echo flushall | redis-cli`);

    await fetchAndQueueJobs();

    // Set an interval to fetch new jobs from the database
    setInterval(async () => {
        await fetchAndQueueJobs();
    }, process.env.FETCH_QUEUE_INTERVAL_MS); // Adjust the interval as needed

})();




