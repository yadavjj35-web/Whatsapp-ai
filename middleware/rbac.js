// path: middleware/rbac.js
/**
 * RBAC middleware
 *
 * Usage:
 *  - Protect routes by required permissions or roles:
 *    router.post('/admin', verifyJwt, rbac('admin'));
 *    router.post('/some-action', verifyJwt, rbac(['workflow:write']));
 *
 * Behavior:
 *  - Expects req.user to be populated by authentication middleware (verifyJwt)
 *  - For role checks: accepts role name string or permission string
 *  - Loads role/permission mapping from config/roles.json (recommended)
 *  - Falls back to in-memory ADMIN_USERS env variable (comma-separated) for bootstrap
 *
 * Notes:
 *  - This middleware intentionally keeps logic simple; for complex policy engines integrate with models/Role and Permission.
 */

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

const rolesFile = path.resolve(process.cwd(), 'config', 'roles.json');

let rolesConfig = null;
try {
  if (fs.existsSync(rolesFile)) {
    const raw = fs.readFileSync(rolesFile, 'utf8');
    rolesConfig = JSON.parse(raw);
  } else {
    rolesConfig = null;
  }
} catch (err) {
  logger.warn('Failed to load roles.json, RBAC may be restricted', { error: err.message });
  rolesConfig = null;
}

/**
 * Check permission helper
 * permissionOrRole: string or array
 */
export function rbac(required) {
  if (!required) {
    // no restriction
    return (req, res, next) => next();
  }

  const requiredArr = Array.isArray(required) ? required : [required];

  return (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      // If user has roles array in JWT, check roles
      const userRoles = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);

      // If roles config present, expand permissions
      const grantedPermissions = new Set();

      if (rolesConfig) {
        for (const r of userRoles) {
          const roleDef = rolesConfig[r];
          if (roleDef && Array.isArray(roleDef.permissions)) {
            for (const p of roleDef.permissions) grantedPermissions.add(p);
          }
        }
      } else {
        // No rolesConfig: conservative fallback:
        // If userRoles includes 'admin' allow everything
        if (userRoles.includes('admin')) {
          // allow
          return next();
        }
      }

      // Also support direct permissions on the user (user.permissions)
      if (Array.isArray(user.permissions)) {
        for (const p of user.permissions) grantedPermissions.add(p);
      }

      // Evaluate requiredArr: each required item must be satisfied (AND)
      const missing = [];
      for (const reqItem of requiredArr) {
        if (userRoles.includes(reqItem)) {
          continue;
        }
        if (grantedPermissions.has(reqItem)) {
          continue;
        }
        // treat reqItem like permission string
        missing.push(reqItem);
      }

      if (missing.length > 0) {
        return res.status(403).json({ success: false, error: 'Insufficient permissions', missing });
      }
      return next();
    } catch (err) {
      logger.error('RBAC middleware error', { error: err.message });
      return res.status(500).json({ success: false, error: 'RBAC error' });
    }
  };
}

export default rbac;
