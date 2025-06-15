const { lookup } = require('dns');
const { spiderPriorityJobQueue } = require('./src/queue/jobQueue');
const logger = require('./src/utils/logger');
require('dotenv').config();
const path = require('path');

// Assuming __dirname is the current directory where your script resides
const absolutePath = path.resolve(__dirname, 'src', 'spider.js');
logger.debug(absolutePath);
// Setting up the consumer to process jobs from the queue
spiderPriorityJobQueue.process(+process.env.NUM_SPIDER, absolutePath);

logger.verbose(`Consumer has started with ${process.env.NUM_SPIDER} processing instances and running...`);
