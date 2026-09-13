import cron from 'node-cron';

console.log(JSON.stringify({
  hasSchedule: typeof cron.schedule === 'function',
  hasValidate: typeof cron.validate === 'function',
  validEvery15: cron.validate('*/15 * * * *'),
}));
