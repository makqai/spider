# Spider

A modular and extensible web scraping framework built with Node.js. This tool enables launching, managing, and queueing web scraping jobs with ease. It includes support for job scheduling, logging, database storage, and custom scraping logic.

---

## Features

* **Job Management**: Manage and queue scraping jobs efficiently.
* **Scraping Engine**: Modular scraping logic to target different websites.
* **Logging**: Integrated logging utilities.
* **Database Integration**: Easily store and retrieve scraping results.
* **Environment Configuration**: `.env` support for sensitive configurations.

---

## Project Structure

```
spider-master/
├── .env.example               # Sample environment configuration
├── .gitignore
├── ecosystem.config.example.js  # Example PM2 ecosystem file
├── package.json               # Project dependencies and scripts
├── scrape-test.js             # Script for testing scraping functionality
├── spider-job-manager.js      # Entry point for job management
├── spider-launcher.js         # Entry point for launching spiders
├── yarn.lock
├── src/
│   ├── scrape.js              # Scraping logic
│   ├── spider.js              # Spider core logic
│   ├── db/
│   │   └── database.js        # Database connection and queries
│   ├── queue/
│   │   └── jobQueue.js        # Job queue management
│   └── utils/
│       ├── logger.js          # Logging utility
│       └── mime.js            # MIME type handling
```

---

## Getting Started

### Prerequisites

* Node.js (v14+ recommended)
* Yarn or npm

### Installation

```bash
git clone <repository_url>
cd spider-master
yarn install
cp .env.example .env
# Edit the .env file with your actual settings
```

### Running the Spider

```bash
node spider-launcher.js
```

### Running a Test Scrape

```bash
node scrape-test.js
```

### Managing Jobs

```bash
node spider-job-manager.js
```

---

## Configuration

You can use the `.env` file to configure database connections, job settings, and other runtime parameters.

---

## PM2 Deployment (Optional)

You can use `ecosystem.config.example.js` to set up PM2 for process management.

```bash
pm2 start ecosystem.config.example.js
```

---

## License

MIT License (if applicable)

---

## Contributing

Feel free to fork the repository and submit pull requests. Issues and suggestions are welcome.

---

## Author

Created by \[Muhammad Adnan Kamal]
