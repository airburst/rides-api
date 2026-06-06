export default {
  apps: [
    {
      name: "rides-api",
      script: "/home/ubuntu/.bun/bin/bun",
      args: "src/index.ts",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};