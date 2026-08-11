import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JWT_SECRET, authenticate, authorize, extractToken } from '../middleware/auth';
import pool from '../db/connection';
import { NotificationService } from '../services/NotificationService';

const router = Router();

// SSE stream authenticates via the httpOnly auth_token cookie (sent automatically
// by EventSource for same-origin) or an Authorization: Bearer header. The token is
// never accepted from the query string: a URL-borne JWT leaks into browser history,
// Referer headers, and proxy/nginx access logs.
router.get('/stream', async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: 'Token manquant' });
    return;
  }
  let decoded: { must_change_password?: boolean };
  try {
    decoded = jwt.verify(token, JWT_SECRET as string, { algorithms: ['HS256'] }) as {
      must_change_password?: boolean;
    };
  } catch {
    res.status(401).json({ success: false, error: 'Token invalide' });
    return;
  }
  // A user locked to the change-password flow must not open a live data stream.
  if (decoded.must_change_password) {
    res.status(403).json({ success: false, error: 'Changement de mot de passe requis' });
    return;
  }
  // Fail closed exactly like `authenticate`: require a live, unrevoked, unexpired
  // session row AND an active owning user — a deactivated employee is cut off at once.
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await pool.query(
      `SELECT s.revoked_at, s.expires_at, u.actif AS user_actif
       FROM user_sessions s
       JOIN utilisateurs u ON u.id = s.utilisateur_id
       WHERE s.token_hash = $1 AND s.is_active = true`,
      [tokenHash]
    );
    const session = rows[0];
    if (
      !session ||
      session.revoked_at ||
      session.user_actif === false ||
      new Date(session.expires_at) < new Date()
    ) {
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
