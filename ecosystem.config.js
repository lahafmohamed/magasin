// Secrets are NOT stored here. Provide them via the environment (e.g. an untracked
// backend/.env loaded by dotenv, or the shell that runs `pm2 start`).
// See .env.example for the required variables.

// Required in production: refuse to boot with a bogus default identity rather
// than silently connecting as a fallback user (matches JWT_SECRET's fail-hard).
function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`ecosystem.config.js: environment variable ${name} is required (no fallback).`);
  }
  return value;
}

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
        // No fallback identity: require an explicit DB user rather than the old
        // hardcoded 'mohamed' default. Password is passed through as-is — an
        // empty/unset password is legitimate for socket peer auth (the default
        // DB_HOST above is a unix socket), so it is intentionally not required.
        DB_USER: requiredEnv('DB_USER'),
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
