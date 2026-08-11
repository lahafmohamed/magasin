import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { UserModel } from '../models/UserModel';
import { generateToken, AuthRequest, revokeSession, revokeAllUserSessions, extractToken } from '../middleware/auth';
import pool from '../db/connection';
import { logger } from '../utils/logger';
import { getSessionMaxAgeMs, isStrongPassword } from '../utils/security';

const BCRYPT_ROUNDS = 12;

// Real cost-12 hash used only to spend the same ~bcrypt time on the
// user-not-found path as on a wrong-password path, so response latency no
// longer reveals whether a username exists (enumeration guard). It matches no
// password; an invalid hash string would return instantly and defeat the point.
const DUMMY_PASSWORD_HASH = '$2b$12$UdsXhS0wVwauiQh4ToabyemZEkGJcneZl8DvWXlPAPqY/XDfTRvIq';

export class AuthController {
  /**
   * POST /api/auth/login
   * Authenticate user and return JWT token
   */
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({
          success: false,
          error: 'Username et mot de passe requis',
        });
        return;
      }

      const user = await UserModel.findByUsername(username);

      if (!user) {
        // Spend the same bcrypt time as a real wrong-password attempt so the
        // response latency doesn't leak whether the username exists.
        await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
        res.status(401).json({
          success: false,
          error: 'Identifiants invalides',
        });
        return;
      }

      if (!user.actif) {
        res.status(403).json({
          success: false,
          error: 'Compte désactivé',
        });
        return;
      }

      const isValidPassword = await bcrypt.compare(password, user.password_hash);

      if (!isValidPassword) {
        res.status(401).json({
          success: false,
          error: 'Identifiants invalides',
        });
        return;
      }

      // Update last login
      await UserModel.updateLastLogin(user.id);

      // Generate token with session tracking
      const token = await generateToken({
        id: user.id,
        username: user.username,
        role: user.role,
        must_change_password: user.must_change_password ?? false,
      }, req);

      // Log audit
      // Audit logging must never break authentication — best-effort only.
      try {
        await pool.query(
          `INSERT INTO audit_log (user_id, action, table_name, record_id, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [user.id, 'login', 'utilisateurs', user.id, req.ip, req.get('user-agent')]
        );
      } catch (e) { logger.warn({ err: e }, 'audit log insert failed (non-fatal)'); }

      // Primary auth transport: httpOnly cookie (not readable by JS → XSS-safe).
      // The SPA relies on the cookie + cached non-sensitive auth_user (no token in
      // localStorage). The token is still returned in the body for non-browser API
      // clients / integration tests that authenticate via the Authorization header.
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: getSessionMaxAgeMs(), // derived from JWT_EXPIRATION (single source)
        path: '/',
      });

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            nom_complet: user.nom_complet,
            role: user.role,
            must_change_password: user.must_change_password ?? false,
          },
          token,
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Login error');
      res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur',
      });
    }
  }

  /**
   * POST /api/auth/logout
   * Logout and revoke session
   */
  static async logout(req: AuthRequest, res: Response): Promise<void> {
    try {
      const token = extractToken(req);
      if (token) {
        await revokeSession(token);
      }
      res.clearCookie('auth_token', { path: '/' });

      res.json({
        success: true,
        message: 'Déconnexion réussie',
      });
    } catch (error) {
      logger.error({ err: error }, 'Logout error');
      res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur',
      });
    }
  }

  /**
   * POST /api/auth/revoke-all-sessions (admin only)
   * Revoke all sessions for a user
   */
  static async revokeAllSessions(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        res.status(400).json({ error: 'User ID requis' });
        return;
      }

      await revokeAllUserSessions(parseInt(userId));

      res.json({
        success: true,
        message: 'Toutes les sessions ont été révoquées',
      });
    } catch (error) {
      logger.error({ err: error }, 'Revoke all sessions error');
      res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur',
      });
    }
  }

  /**
   * POST /api/auth/register
   * Register a new user (admin only)
   */
  /** Password complexity policy — delegates to the shared single source. */
  static isStrongPassword(pw: unknown): boolean {
    return isStrongPassword(pw);
  }

  static async register(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { username, email, password, nom_complet, role } = req.body;

      if (!username || !password) {
        res.status(400).json({
          success: false,
          error: 'Username et mot de passe requis',
        });
        return;
      }

      if (!AuthController.isStrongPassword(password)) {
        res.status(400).json({
          success: false,
          error: 'Le mot de passe doit contenir au moins 8 caractères, dont une lettre et un chiffre.',
        });
        return;
      }

      // Check if username already exists
      const existingUser = await UserModel.findByUsername(username);
      if (existingUser) {
        res.status(409).json({
          success: false,
          error: 'Username déjà utilisé',
        });
        return;
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      // Resolve the requested role name to its role_id (fallback: caissier).
      let roleId = 3;
      const requestedRole = typeof role === 'string' ? role : 'caissier';
      const { rows: roleRows } = await pool.query('SELECT id FROM roles WHERE nom = $1', [requestedRole]);
      if (roleRows.length > 0) {
        roleId = roleRows[0].id;
      } else {
        const { rows: fallback } = await pool.query("SELECT id FROM roles WHERE nom = 'caissier'");
        if (fallback.length > 0) roleId = fallback[0].id;
      }

      // Create user
      const user = await UserModel.create({
        username,
        email,
        password_hash,
        nom_complet,
        role_id: roleId,
      });

      // Log audit
      // Audit logging must never break authentication — best-effort only.
      try {
        await pool.query(
          `INSERT INTO audit_log (user_id, action, table_name, record_id, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.user!.id, 'create', 'utilisateurs', user.id, req.ip, req.get('user-agent')]
        );
      } catch (e) { logger.warn({ err: e }, 'audit log insert failed (non-fatal)'); }

      res.status(201).json({
        success: true,
        data: {
          id: user.id,
          username: user.username,
          email: user.email,
          nom_complet: user.nom_complet,
          role: user.role,
          actif: user.actif,
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Register error');
      res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur',
      });
    }
  }

  /**
   * GET /api/auth/me
   * Get current user info
   */
  static async me(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Non authentifié',
        });
        return;
      }

      const user = await UserModel.findById(req.user.id);

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'Utilisateur non trouvé',
        });
        return;
      }

      const { password_hash: _passwordHash, ...safeUser } = user;
      res.json({
        success: true,
        data: safeUser,
      });
    } catch (error) {
      logger.error({ err: error }, 'Me error');
      res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur',
      });
    }
  }

  /**
   * PUT /api/auth/change-password
   * Change current user's password
   */
  static async changePassword(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({
          success: false,
          error: 'Mot de passe actuel et nouveau mot de passe requis',
        });
        return;
      }

      // Password complexity policy: ≥8 chars with at least one letter and one digit
      if (!AuthController.isStrongPassword(newPassword)) {
        res.status(400).json({
          success: false,
          error: 'Le mot de passe doit contenir au moins 8 caractères, dont une lettre et un chiffre.',
        });
        return;
      }

      const user = await UserModel.findById(req.user!.id);
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'Utilisateur non trouvé',
        });
        return;
      }

      const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValidPassword) {
        res.status(401).json({
          success: false,
          error: 'Mot de passe actuel incorrect',
        });
        return;
      }

      const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

      await pool.query(
        'UPDATE utilisateurs SET password_hash = $1, must_change_password = false, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newPasswordHash, req.user!.id]
      );

      // Invalidate every OTHER session for this user — a password change must
      // kick out any stolen/old session, while keeping the caller logged in.
      try {
        const currentToken = extractToken(req) || undefined;
        await revokeAllUserSessions(req.user!.id, currentToken);
      } catch (e) {
        logger.warn({ err: e }, 'revoke-other-sessions after password change failed (non-fatal)');
      }

      res.json({
        success: true,
        message: 'Mot de passe mis à jour',
      });
    } catch (error) {
      logger.error({ err: error }, 'Change password error');
      res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur',
      });
    }
  }

  /**
   * GET /api/users
   * Get all users (admin only)
   */
  static async getAllUsers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const { users, total } = await UserModel.findAll(page, limit);

      res.json({
        success: true,
        data: users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Get users error');
      res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur',
      });
    }
  }

  /**
   * PUT /api/users/:id
   * Update a user (admin only)
   */
  static async updateUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.id);
      const { email, nom_complet, role_id, actif } = req.body;

      const user = await UserModel.update(userId, {
        email,
        nom_complet,
        role_id,
        actif,
      });

      // Deactivating or changing a user's role must terminate their live
      // sessions immediately, not wait for JWT expiry: the role is carried
      // inside the JWT and only re-read at login, so a demoted user would
      // otherwise keep their old privileges until the token expires.
      if (actif === false || role_id !== undefined) {
        try {
          await revokeAllUserSessions(userId);
        } catch (e) {
          logger.warn({ err: e }, 'session revocation on user update failed (non-fatal)');
        }
      }

      // Log audit
      // Audit logging must never break authentication — best-effort only.
      try {
        await pool.query(
          `INSERT INTO audit_log (user_id, action, table_name, record_id, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.user!.id, 'update', 'utilisateurs', userId, req.ip, req.get('user-agent')]
        );
      } catch (e) { logger.warn({ err: e }, 'audit log insert failed (non-fatal)'); }

      res.json({
        success: true,
        data: {
          id: user.id,
          username: user.username,
          email: user.email,
          nom_complet: user.nom_complet,
          role: user.role,
          actif: user.actif,
        },
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Update user error');
      if (error.message === 'Utilisateur non trouvé') {
        res.status(404).json({
          success: false,
          error: 'Utilisateur non trouvé',
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur',
      });
    }
  }
}
