import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../db/connection';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
  };
}

// JWT_SECRET must be set in environment - fail loudly if not configured
const JWT_SECRET = process.env.JWT_SECRET;
const PLACEHOLDER_SECRETS = [
  'change-this-to-a-random-secret-key-in-production',
  'generate-a-random-secret-key-here',
];
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required. Please set it in your .env file.');
}
if (JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long.');
}
if (PLACEHOLDER_SECRETS.includes(JWT_SECRET)) {
  throw new Error('JWT_SECRET is still set to the default placeholder. Change it to a random secret before starting.');
}

const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '7d';

export { JWT_SECRET, JWT_EXPIRATION };

/**
 * Extract the JWT from the request: httpOnly `auth_token` cookie (primary) or
 * `Authorization: Bearer` header (fallback for native/transitional clients).
 * Cookies are parsed from the raw header to avoid a cookie-parser dependency.
 */
export const extractToken = (req: { headers: { cookie?: string; authorization?: string } }): string | null => {
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('auth_token='));
    if (match) return decodeURIComponent(match.slice('auth_token='.length));
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  return null;
};

/**
 * Middleware to verify JWT token and attach user to request
 */
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Token d\'authentification manquant',
    });
    return;
  }


  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as {
      id: number;
      username: string;
      role: string;
      must_change_password?: boolean;
    };

    // Block all requests except the change-password endpoint itself when a
    // password change is required — otherwise the user is permanently locked out.
    const isChangePasswordRequest = req.path.endsWith('/change-password');
    if (decoded.must_change_password && !isChangePasswordRequest) {
      res.status(403).json({
        success: false,
        error: 'Vous devez changer votre mot de passe avant de continuer.',
        must_change_password: true,
      });
      return;
    }

    // Fail closed: a valid JWT is not enough — an active, unrevoked,
    // unexpired session row must exist for this exact token.
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await pool.query(
      'SELECT id, revoked_at, expires_at, is_active FROM user_sessions WHERE token_hash = $1',
      [tokenHash]
    );

    if (rows.length === 0) {
      res.status(401).json({
        success: false,
        error: 'Session invalide, veuillez vous reconnecter',
      });
      return;
    }

    const session = rows[0];

    if (session.revoked_at || !session.is_active) {
      res.status(401).json({
        success: false,
        error: 'Session révoquée, veuillez vous reconnecter',
      });
      return;
    }

    if (new Date(session.expires_at) < new Date()) {
      res.status(401).json({
        success: false,
        error: 'Session expirée, veuillez vous reconnecter',
      });
      return;
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: 'Session expirée, veuillez vous reconnecter',
      });
      return;
    }

    res.status(403).json({
      success: false,
      error: 'Token invalide',
    });
    return;
  }
};

/**
 * Middleware to check if user has required role
 */
export const authorize = (...roles: (string | string[])[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Non authentifié',
      });
      return;
    }

    // Support both authorize('admin', 'manager') and authorize(['admin', 'manager']) usages.
    const normalizedRoles = roles.flatMap((role) => (Array.isArray(role) ? role : [role]));

    if (!normalizedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Permissions insuffisantes',
      });
      return;
    }

    next();
  };
};

/**
 * Generate JWT token for a user and create session
 */
export const generateToken = async (user: { id: number; username: string; role: string; must_change_password?: boolean }, req?: any): Promise<string> => {
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, must_change_password: user.must_change_password ?? false },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRATION } as jwt.SignOptions
  );

  // Store session for revocation support
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

  // Session row is mandatory: authenticate() fails closed without it, so a
  // failed INSERT must fail the login rather than mint an unusable token.
  await pool.query(
    `INSERT INTO user_sessions (utilisateur_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, tokenHash, expiresAt, req?.ip, req?.headers?.['user-agent']]
  );

  return token;
};

/**
 * Revoke a session (logout)
 */
export const revokeSession = async (token: string): Promise<void> => {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  
  await pool.query(
    `UPDATE user_sessions 
     SET revoked_at = CURRENT_TIMESTAMP, is_active = false 
     WHERE token_hash = $1`,
    [tokenHash]
  );
};

/**
 * Revoke all sessions for a user
 */
export const revokeAllUserSessions = async (userId: number): Promise<void> => {
  await pool.query(
    `UPDATE user_sessions 
     SET revoked_at = CURRENT_TIMESTAMP, is_active = false 
     WHERE utilisateur_id = $1 AND is_active = true`,
    [userId]
  );
};
