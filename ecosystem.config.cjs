module.exports = {
  apps: [
    {
      name: "rides-api",
      script: "/home/ubuntu/.bun/bin/bun",
      args: "dist/index.js",
      cwd: "/home/ubuntu/rides-api",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      error_file: "~/logs/rides-api-error.log",
      out_file: "~/logs/rides-api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "500M",
    },
  ],
};
