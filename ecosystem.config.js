module.exports = {
  apps: [
    {
      name: 'hitektest-api',
      script: './backend/dist/server.js',
      cwd: '/home/mohamed/gestion/HitekProjet/magasin',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 6100,
        DB_HOST: '/var/run/postgresql',
        DB_PORT: 5432,
        DB_USER: 'mohamed',
        DB_PASSWORD: '',
        DB_NAME: 'HitekDb',
        JWT_SECRET: 'hitek-jwt-secret-key-2024-very-long-and-secure-for-testing',
        JWT_EXPIRATION: '7d',
        FRONTEND_URL: 'http://localhost:6101'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      time: true
    }
  ]
};
