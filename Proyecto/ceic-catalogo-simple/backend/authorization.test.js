const test = require('node:test');
const assert = require('node:assert/strict');
const { isAdmin, hasAssignedWorkshop, canManageWorkshop } = require('./authorization');

test('only an administrator identity receives admin privileges', () => {
  assert.equal(isAdmin({ role: 'admin' }), true);
  assert.equal(isAdmin({ role: 'user' }), false);
  assert.equal(isAdmin(null), false);
});

test('only a user with a positive workshop ID is assigned', () => {
  assert.equal(hasAssignedWorkshop({ role: 'user', id_taller: 3 }), true);
  assert.equal(hasAssignedWorkshop({ role: 'user', id_taller: null }), false);
  assert.equal(hasAssignedWorkshop({ role: 'admin', id_taller: 3 }), false);
});

test('users can manage only the workshop assigned by the server identity', () => {
  const identity = { role: 'user', id_taller: 12 };
  assert.equal(canManageWorkshop(identity, 12), true);
  assert.equal(canManageWorkshop(identity, '12'), true);
  assert.equal(canManageWorkshop(identity, 13), false);
  assert.equal(canManageWorkshop({ role: 'user', id_taller: null }, 12), false);
});

test('administrators can manage any workshop', () => {
  assert.equal(canManageWorkshop({ role: 'admin' }, 12), true);
});