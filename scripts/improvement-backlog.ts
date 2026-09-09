import { loadImprovementBacklog, saveImprovementBacklog, renderImprovementBacklogMarkdown, validateBacklog } from '@/lib/monitoring/improvement-backlog';

async function main() {
  const backlog = await loadImprovementBacklog();
  validateBacklog(backlog);
  const files = await saveImprovementBacklog(backlog);
  console.log(JSON.stringify({ status: 'OK', hypotheses: backlog.hypotheses.length, files }, null, 2));
  console.log(renderImprovementBacklogMarkdown(backlog));
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
