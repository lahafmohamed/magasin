import dotenv from 'dotenv';
import { assertSafeTestDatabase } from './databaseGuard';

// Keep explicit shell/CI values authoritative while still supporting a local
// backend/.env file. The assertion runs before any test module is evaluated.
dotenv.config();
assertSafeTestDatabase();
