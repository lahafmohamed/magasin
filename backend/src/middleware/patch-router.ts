import express from 'express';

// Save original Router factory
const originalRouter = express.Router;

// Monkey-patch express.Router to inject global parameter validation
express.Router = function(options?: any) {
  const router = originalRouter(options);

  // List of ID parameters used in the application routes that must be valid positive integers
  const idParams = [
    'id',
    'clientId',
    'commandeId',
    'factureId',
    'pieceId',
    'sessionId',
    'session_id',
    'userId'
  ];

  idParams.forEach(paramName => {
    router.param(paramName, (req: any, res: any, next: any, val: any) => {
      const num = parseInt(val, 10);
      if (isNaN(num) || !/^\d+$/.test(val)) {
        return res.status(400).json({
          success: false,
          error: `Identifiant invalide pour ${paramName}`
        });
      }
      next();
    });
  });

  return router;
};
