'use strict';
const { createHandoutStore: createReader } = require('./staff-handout');

// Packaged only with the redeem Lambda. The session Lambda remains read-only for
// collection state and has no EXECUTE permission on change_staff_handout.
function createHandoutStore(dependencies) {
  const { executeStatement, mappedRows, stringParameter: p } = dependencies;
  async function change(session, staff, request, manifest) {
    const result = await executeStatement(`SELECT jumpyard.change_staff_handout(
      :sessionId, :venueId, :actorId, :actorName, :area, :action, CAST(:revision AS integer),
      CAST(:selection AS jsonb), CAST(:manifest AS jsonb))::text AS result`, [
      p('sessionId', session.checkinSessionId), p('venueId', staff.venueId),
      p('actorId', staff.staffIdentityId || staff.actorId), p('actorName', staff.displayName || 'Personal'),
      p('area', request.area), p('action', request.action), p('revision', String(request.revision)),
      p('selection', JSON.stringify(request.selection || [])), p('manifest', JSON.stringify(manifest)),
    ]);
    try { return JSON.parse(mappedRows(result)[0]?.result) || { error: 'handout_failed' }; }
    catch { return { error: 'handout_failed' }; }
  }
  return { ...createReader(dependencies), change };
}
module.exports = { createHandoutStore };
