module.exports = {
    apps : [
        {
            name: 'spider-launcher',
            script: 'spider-launcher.js',
            args: '',
            exec_mode: "cluster",
            instances: 1,
            autorestart: true,
            exp_backoff_restart_delay: 1000,
            watch: false,
            max_memory_restart: '2G',
            env: {
                NODE_ENV: 'production'
            },
            pid_file: '/home/ubuntu/logs/spiderV2/pid/spider-launcher-id.pid',
            output: '/home/ubuntu/logs/spiderV2/raw-logs/output.log',
            error: '/home/ubuntu/logs/spiderV2/raw-logs/error.log',
            log: '/home/ubuntu/logs/spiderV2/spider-launcher.log',
            merge_logs: true
        },
        {
            name: 'spider-job-manager',
            script: 'spider-job-manager.js',
            args: '',
            exec_mode: "cluster",
            instances: 1,
            autorestart: true,
            exp_backoff_restart_delay: 1000,
            watch: false,
            max_memory_restart: '2G',
            env: {
                NODE_ENV: 'production'
            },
            pid_file: '/home/ubuntu/logs/spiderV2/pid/spider-job-manager-id.pid',
            output: '/home/ubuntu/logs/spiderV2/raw-logs/output.log',
            error: '/home/ubuntu/logs/spiderV2/raw-logs/error.log',
            log: '/home/ubuntu/logs/spiderV2/spider-job-manager.log',
            merge_logs: true
        }
    ]
};
