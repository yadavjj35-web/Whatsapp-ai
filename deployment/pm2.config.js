// path: deployment/pm2.config.js
export default {
  apps: [
    {
      name: 'whatsapp-ai',
      script: './server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
