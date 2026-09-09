import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets } from '../lib/monitoring/redaction';

test('redactSecrets removes common token password and database URL patterns', () => {
  const raw = 'DATABASE_URL=postgresql://user:pass@host/db TELEGRAM_BOT_TOKEN=123:abc password=secret api_key=xyz';
  const redacted = redactSecrets(raw);
  assert.equal(redacted.includes('pass@host'), false);
  assert.equal(redacted.includes('123:abc'), false);
  assert.equal(redacted.includes('secret'), false);
  assert.equal(redacted.includes('xyz'), false);
  assert.ok(redacted.includes('[REDACTED]'));
});
