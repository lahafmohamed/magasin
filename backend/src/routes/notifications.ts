import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JWT_SECRET, authenticate, authorize, extractToken } from '../middleware/auth';
import pool from '../db/connection';
import { NotificationService } from '../services/NotificationService';

const router = Router();

// SSE stream authenticates via the httpOnly auth_token cookie (sent automatically
// by EventSource for same-origin). Falls back to ?token= for transitional clients.
router.get('/stream', async (req: Request, res: Response) => {
  const token = extractToken(req) || (req.query.token as string);
  if (!token) {
    res.status(401).json({ success: false, error: 'Token manquant' });
    return;
  }
  try {
    jwt.verify(token, JWT_SECRET as string, { algorithms: ['HS256'] });
  } catch {
    res.status(401).json({ success: false, error: 'Token invalide' });
    return;
  }
  // Enforce session revocation/expiry like `authenticate` does — fail closed:
  // a token without a live session row (revoked, expired, or never issued) is rejected.
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await pool.query(
      'SELECT revoked_at, expires_at FROM user_sessions WHERE token_hash = $1 AND is_active = true',
      [tokenHash]
    );
    const session = rows[0];
    if (!session || session.revoked_at || new Date(session.expires_at) < new Date()) {
      res.status(401).json({ success: false, error: 'Session révoquée ou expirée' });
      return;
    }
  } catch {
    res.status(401).json({ success: false, error: 'Token invalide' });
    return;
  }
  NotificationService.addClient(req, res);
});

// Endpoint pour récupérer l'état du service (admin/manager-only)
router.get('/status', authenticate, authorize(['admin', 'manager']), (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      clients: NotificationService.getClientCount(),
      status: 'running',
    },
  });
});

export default router;
export { NotificationService };
