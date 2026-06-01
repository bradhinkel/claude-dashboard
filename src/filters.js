// Shared record filtering used by the server (and reusable by the CLI).
export function applyFilters(records, { model, project, from, to } = {}) {
  return records.filter((r) => {
    if (model && r.model !== model) return false;
    if (project && r.project !== project) return false;
    if (from && (!r.timestamp || r.timestamp < from)) return false;
    if (to && (!r.timestamp || r.timestamp > to)) return false;
    return true;
  });
}
