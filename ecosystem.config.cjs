module.exports = {
  apps: [
    {
      name: 'falconx-bot',
      script: 'npm',
      args: 'start',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        HEADLESS: 'true',
        DASHBOARD_HOST: '0.0.0.0',
        DASHBOARD_PORT: 3300
      }
    }
  ]
};
