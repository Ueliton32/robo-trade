import { DecisionEngine } from './decision-engine';

(async () => {
  const engine = new DecisionEngine();
  const report = engine.run();
  console.log(JSON.stringify(report, null, 2));
})();
