const PANOL_ROLES = Object.freeze([
  'operador',
  'supervisor',
  'coordinador',
  'admin',
])

const PANOL_PERMISSIONS = Object.freeze({
  read: PANOL_ROLES,
  operate: PANOL_ROLES,
  files: PANOL_ROLES,
})

module.exports = { PANOL_ROLES, PANOL_PERMISSIONS }
