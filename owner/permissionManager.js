// path: /owner/permissionManager.js
/**
 * Permission Manager
 * - Determines owner/admin privileges
 * - For now relies on env configured owner list or minimal roles store
 */

const OWNER_IDS = (process.env.OWNER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

function isOwner(user) {
  if (!user) return false;
  if (!OWNER_IDS.length) return true; // permissive in dev if not set
  return OWNER_IDS.includes(user.id || user.email || user.phone);
}

export default { isOwner };
