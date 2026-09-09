import fs from 'node:fs/promises';
import path from 'node:path';
import { REPORT_ROOT, MonitoringRunResult } from './contracts';
import { redactSecrets } from './redaction';

function slugTime(iso: string): string { return iso.replace(/[:.]/g, '-'); }

export function renderMarkdownReport(run: MonitoringRunResult): string {
  const safe = redactSecrets(run);
  const checks = [...safe.checks, ...safe.notApplicable];
  return `# Monitoring ${safe.kind} — ${safe.overallStatus}\n\n` +
    `- Generated at: ${safe.generatedAt}\n` +
    `- Timezone: ${safe.timezone}\n` +
    `- Commit SHA: ${safe.commitSha}\n` +
    `- Code version: ${safe.codeVersion}\n` +
    `- Strategy version: ${safe.strategyVersion}\n` +
    `- Config version: ${safe.configVersion ?? 'unknown'}\n` +
    `- Period: ${safe.period.start} → ${safe.period.end}\n` +
    `- Data sources: ${safe.dataSources.join(', ') || 'none'}\n` +
    `- Duration ms: ${safe.durationMs ?? 'n/a'}\n\n` +
    `## Checks\n\n` +
    checks.map((c) => `### ${c.status} — ${c.name}\n\n- id: ${c.id}\n- evidence: \`${JSON.stringify(redactSecrets(c.evidence))}\`\n- limitations: ${c.limitations.join('; ') || 'none'}\n- manual actions: ${c.suggestedManualActions.join('; ') || 'none'}\n`).join('\n') +
    `\n## Baseline comparison\n\n\`${JSON.stringify(redactSecrets(safe.baselineComparison ?? null))}\`\n\n` +
    `## Limitations\n\n${safe.limitations.map((l) => `- ${l}`).join('\n') || '- none'}\n`;
}

export async function writeMonitoringReport(run: MonitoringRunResult): Promise<{ mdPath: string; jsonPath: string; logPath: string }> {
  const dir = path.join(process.cwd(), REPORT_ROOT, run.kind === 'update' ? 'regressions' : run.kind);
  await fs.mkdir(dir, { recursive: true });
  const base = `${run.kind}-${slugTime(run.generatedAt)}`;
  const mdPath = path.join(dir, `${base}.md`);
  const jsonPath = path.join(dir, `${base}.json`);
  const logPath = path.join(dir, `${base}.log`);
  await fs.writeFile(mdPath, renderMarkdownReport(run));
  await fs.writeFile(jsonPath, JSON.stringify(redactSecrets(run), null, 2));
  await fs.writeFile(logPath, `${run.kind} ${run.overallStatus} ${run.generatedAt} checks=${run.checks.length}\n`);
  return { mdPath, jsonPath, logPath };
}
