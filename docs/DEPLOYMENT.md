# DEPLOYMENT

This document outlines recommended deployment steps for production.

1. Environment
   - Use a VPS (Ubuntu 22.04+ recommended).
   - Install Node.js v20+, PM2, Nginx, MongoDB (or use managed Mongo Atlas).
   - Store secrets in environment or a secure vault (do not commit .env).

2. Build & Run
   - Clone repo
   - npm ci
   - Copy `.env.example` to `.env` and fill values
   - pm2 start deployment/pm2.config.js
   - Setup Nginx reverse proxy using deployment/nginx.conf
   - Enable SSL via Certbot

3. Logging & Monitoring
   - Logs are saved to ./logs via Winston.
   - Use `pm2 logs` and `pm2 monit`. For production metrics, integrate with Prometheus/Grafana.

4. Webhook
   - Configure your WhatsApp Cloud webhook URL at:
     https://your.domain/api/v1/webhook
   - Use the verify token and app secret configured in env.

5. Scaling
   - Replica: run multiple PM2 instances and use a load balancer.
   - Use Redis for queue and session storage if required.

6. Backups
   - Regularly backup MongoDB and store backups offsite.
