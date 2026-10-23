#!/usr/bin/env tsx
import { experimentRegistry } from '@/lib/experiment-registry';
import { format } from 'date-fns';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'list';

  switch (command) {
    case 'list': {
      const experiments = await experimentRegistry.listExperiments();
      console.log(`Found ${experiments.length} experiments:`);
      for (const exp of experiments) {
        console.log(`  ${exp.id} | ${exp.name} | ${exp.agent} | ${exp.status} | ${format(new Date(exp.created_at), 'yyyy-MM-dd HH:mm')}`);
      }
      break;
    }
    case 'create': {
      if (args.length < 2) {
        console.error('Usage: npm run experiments -- create <name> <hypothesis>');
        process.exit(1);
      }
      const [name, hypothesis] = args.slice(1, 3);
      const experiment = await experimentRegistry.createExperiment({
        name,
        hypothesis,
        agent: 'cli',
        config: {},
        code_version: 'manual',
        data_version: 'manual',
      });
      console.log(`Created experiment ${experiment.id}`);
      break;
    }
    case 'get': {
      if (args.length < 2) {
        console.error('Usage: npm run experiments -- get <id>');
        process.exit(1);
      }
      const id = args[1];
      const exp = await experimentRegistry.getExperimentById(id);
      if (!exp) {
        console.log(`Experiment ${id} not found`);
        process.exit(1);
      }
      console.log(JSON.stringify(exp, null, 2));
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      console.log('Available commands: list, create, get');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
