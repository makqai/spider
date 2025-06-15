const mysql = require('mysql2/promise');
const logger = require('../utils/logger');
require('dotenv').config()

// MySQL database configuration
const dbConfig = {
    host: process.env.HOST,
    port: process.env.PORT || 3306,
    user: process.env.USERNAME,
    password: process.env.PASSWORD,
    database: process.env.DATABASE,
};

// Function to connect to the MySQL database
const connectToDatabase = async () => {
    try {
        const connection = await mysql.createConnection(dbConfig);
        logger.debug('Connected to the database');
        return connection;
    } catch (error) {
        logger.error('Error connecting to the database:', error.message);
        throw error;
    }
}

const getReCrawlingLinks = async (sqId) => {
    let db;
    let rows = [];
    try {
        db = await mysql.createConnection(dbConfig);
        [rows] = await db.query(`SELECT url FROM spider_url WHERE sq_id = ?`, [sqId]);
    } catch (error) {
        logger.error(error.stack);
    } finally {
        db.end();
    }
    return rows;
}

module.exports = { connectToDatabase, getReCrawlingLinks };