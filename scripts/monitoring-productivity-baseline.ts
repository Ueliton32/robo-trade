import { ensureProductivityBaseline } from '@/lib/monitoring/productivity';

ensureProductivityBaseline()
  .then((path) => console.log(JSON.stringify({ status: 'OK', productivityBaseline: path }, null, 2)))
  .catch((e) => { console.error(e?.message ?? e); process.exit(1); });
