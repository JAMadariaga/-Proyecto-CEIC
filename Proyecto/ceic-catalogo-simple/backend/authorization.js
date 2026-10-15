const isAdmin = (identity) => identity?.role === 'admin';

const hasAssignedWorkshop = (identity) =>
  identity?.role === 'user' && Number.isInteger(Number(identity.id_taller)) && Number(identity.id_taller) > 0;

const canManageWorkshop = (identity, workshopId) =>
  isAdmin(identity) || (
    hasAssignedWorkshop(identity) && Number(identity.id_taller) === Number(workshopId)
  );

module.exports = { isAdmin, hasAssignedWorkshop, canManageWorkshop };