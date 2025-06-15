const Queue = require('bull');
require('dotenv').config()

// Initialize the spider job queue
const spiderPriorityJobQueue = new Queue('spiderPriorityJobQueue', {
    redis: {
        host: process.env.REDIS_HOST, // Redis server host
        port: process.env.REDIS_PORT  // Redis server port
    }
});

module.exports = { spiderPriorityJobQueue };
