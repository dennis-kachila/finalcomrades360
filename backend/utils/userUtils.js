/**
 * Helper to strip placeholders so frontend forms show empty fields
 * and provide a consistent user object structure.
 */
const sanitizeUserPayload = (userData) => {
  if (!userData) return null;
  
  const u = { ...userData };
  let originalEmail = u.email;

  // Strip internal placeholders
  if (u.email && String(u.email).startsWith('noemail_')) u.email = '';
  if (u.phone && String(u.phone).startsWith('nophone_')) u.phone = '';

  // Clear name if it matches the email prefix or is a generic "User" string
  if (u.name) {
    if (/^User\d{0,4}$/.test(u.name)) {
      u.name = '';
    } else if (originalEmail && typeof originalEmail === 'string') {
      const prefix = originalEmail.split('@')[0];
      if (u.name === prefix) u.name = '';
    }
  }
  
  // Ensure role and roles are present and consistent
  if (!u.role) u.role = 'customer';
  if (!u.roles) u.roles = [u.role];
  if (!Array.isArray(u.roles)) u.roles = [u.role];
  
  return u;
};

module.exports = {
  sanitizeUserPayload
};
