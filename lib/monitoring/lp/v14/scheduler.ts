import cron from 'node-cron';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { main as runCollector } from './collector';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const LOG_DIR = join(process.cwd(), 'lib/monitoring/lp/v14');
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const LOCK_FILE = join(LOG_DIR, '.scheduler.lock');
const LOG_FILE = join(LOG_DIR, 'scheduler.log');

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(line.trim());
  writeFileSync(LOG_FILE, line, { flag: 'a' });
}

function isRunning(): boolean {
  try {
    if (!existsSync(LOCK_FILE)) return false;
    const pid = Number(readFileSync(LOCK_FILE, 'utf-8').trim());
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

async function run() {
  if (isRunning()) {
    log('Scheduler: previous run still active, skipping');
    return;
  }
  writeFileSync(LOCK_FILE, String(process.pid));
  try {
    log('Scheduler: starting lp:snapshot');
    await runCollector();
    log('Scheduler: lp:snapshot completed');
  } catch (e: any) {
    log(`Scheduler: lp:snapshot failed: ${e?.message ?? e}`);
  } finally {
    if (existsSync(LOCK_FILE)) {
      try { require('fs').unlinkSync(LOCK_FILE); } catch {}
    }
  }
}

// Run immediately once
run();

// Schedule 1 per hour
cron.schedule('0 * * * *', () => {
  run();
});

log('Scheduler started. Next run at next hour.');
