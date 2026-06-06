export default {
  apps: [
    {
      name: "rides-api",
      script: "bun",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
