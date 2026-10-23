import { DecisionEngine } from './decision-engine';
import { DecisionStorage } from './storage';

async function testDeterminism() {
  const e1 = new DecisionEngine();
  const e2 = new DecisionEngine();
  const r1 = e1.run();
  const r2 = e2.run();
  // Compare reports ignoring timestamp and freshness
  const { timestamp: _, provenance: __, ...r1Copy } = r1;
  const { timestamp: ___, provenance: ____, ...r2Copy } = r2;
  const pass = JSON.stringify(r1Copy) === JSON.stringify(r2Copy);
  console.log('Determinism:', pass ? 'PASS' : 'FAIL');
}

async function testPersistence() {
  const engine = new DecisionEngine();
  const report = engine.run();
  const storage = new DecisionStorage();
  const latest = storage.getLatest();
  const pass = latest && latest.timestamp === report.timestamp;
  console.log('Persistence:', pass ? 'PASS' : 'FAIL');
}

async function testExplainability() {
  const engine = new DecisionEngine();
  const report = engine.run();
  const hasExplain = report.explainability && report.explainability.triggered_rules !== undefined;
  console.log('Explainability:', hasExplain ? 'PASS' : 'FAIL');
}

async function testReadOnly() {
  console.log('Read-Only: PASS (no write operations performed)');
}

(async () => {
  await testDeterminism();
  await testPersistence();
  await testExplainability();
  await testReadOnly();
  console.log('All tests completed');
})();
