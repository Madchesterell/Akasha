// Tautan Drive per tugas. Fungsi murni: hasil hanya bergantung pada tugas dan ruang kerja yang dikirim,
// jadi tampilan selalu mengikuti tugas yang sedang aktif.

/** Folder kerja: tautan khusus tugas lebih dulu, lalu folder ruang kerja bila tugas memakainya. */
export function resolveTaskDrive(task, workspaceLink, safeUrl) {
  if (!task) return { folder: '', result: '' };
  const own = safeUrl(task.driveUrl);
  const shared = task.driveSource === 'workspace' ? safeUrl(workspaceLink) : '';
  return { folder: own || shared, result: safeUrl(task.reportFileLink) };
}

const link = (href, text, escapeHtml) =>
  `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="btn-drive-modal">${text}</a>`;

export function driveLinksHtml({ folder, result }, escapeHtml) {
  const parts = [];
  if (folder) parts.push(link(folder, 'Buka folder Drive', escapeHtml));
  if (result) parts.push(link(result, 'Buka hasil kerja', escapeHtml));
  return parts.length
    ? `<div class="drive-links">${parts.join('')}</div>`
    : '<span class="status-text">Belum ada tautan</span>';
}

/** Siapa boleh mengubah tautan folder langsung dari detail tugas. */
export function canEditTaskDrive(task, role, workerName, uid) {
  if (!task) return false;
  // Pemilik tugas dikenali lewat UID bila ada; nama hanya untuk tugas lama.
  const owner = task.assigneeUid ? task.assigneeUid === uid : task.assignee === workerName;
  if (task.driveSource === 'individual') return role === 'mentor' || (role === 'worker' && owner);
  if (task.driveSource === 'task') return role === 'mentor';
  return false;
}
