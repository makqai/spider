const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf } = format;
require('dotenv').config()

const integrisFormat = printf(({ level, message,  timestamp }) => {
    return `${timestamp} ${process.pid} ${level}: ${message}`;
});

const logger = createLogger({
    level: process.env.LOGGER_LEVEL,
    format: combine(
        timestamp(),
        integrisFormat
    )
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new transports.Console({        
        format: combine(
            timestamp(),
            integrisFormat
        )
    }));
} else {
    logger.add(new transports.File({ filename: `logs/error.log`, level: 'error', timestamp: true, maxsize: 10485760 }));
    logger.add(new transports.File({ filename: `logs/combined.log`, timestamp: true, maxsize: 10485760 }));
}

module.exports = logger;






