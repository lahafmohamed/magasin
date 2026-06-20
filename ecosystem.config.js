// Secrets are NOT stored here. Provide them via the environment (e.g. an untracked
// backend/.env loaded by dotenv, or the shell that runs `pm2 start`).
// See .env.example for the required variables.
module.exports = {
  apps: [
    {
      name: 'hitektest-api',
      script: './backend/dist/server.js',
      cwd: process.env.APP_CWD || '/home/mohamed/gestion/HitekProjet/magasin',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 6100,
        DB_HOST: process.env.DB_HOST || '/var/run/postgresql',
        DB_PORT: process.env.DB_PORT || 5432,
        DB_USER: process.env.DB_USER || 'mohamed',
        DB_PASSWORD: process.env.DB_PASSWORD || '',
        DB_NAME: process.env.DB_NAME || 'HitekDb',
        // Must be supplied by the environment; the app refuses to boot without a strong secret.
        JWT_SECRET: process.env.JWT_SECRET,
        JWT_EXPIRATION: process.env.JWT_EXPIRATION || '7d',
        FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:6101'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      time: true
    }
  ]
};
