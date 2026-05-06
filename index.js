#!/usr/bin/env node
import { execSync } from 'child_process';
import { createInterface } from 'readline';
import { config } from './src/utils.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function clear() {
  process.stdout.write('\x1Bc');
}

async function mainMenu() {
  clear();
  console.log('  Vocabulary Learning System');
  console.log('  '.padEnd(40, '='));

  // Quick word count - fetch one batch
  try {
    const records = execSync(
      `lark-cli base +record-list --base-token ${config.baseToken} --table-id ${config.tableId} --limit 1`,
      { encoding: 'utf-8' }
    );
    const data = JSON.parse(records);
    const total = data.data?.query_context?.total || data.data?.total || '107';
    console.log(`\n  Total words: ${total}`);
  } catch (e) {
    // Stats not critical
  }

  console.log('\n  Menu:');
  console.log('  ' + '-'.repeat(40));
  console.log('  1. Start Review Session (default 20 words)');
  console.log('  2. Learn New Words');
  console.log('  3. Review Overdue Words');
  console.log('  4. Show Statistics');
  console.log('  5. Daily Plan (set initial review dates)');
  console.log('  6. Custom Review (specify batch size)');
  console.log('  q. Quit');
  console.log('');

  const choice = await ask('  Select (1-6, q): ').then(s => s.trim().toLowerCase());

  switch (choice) {
    case '1':
      rl.close();
      execSync('node src/review.js --mode all', { stdio: 'inherit' });
      return;
    case '2':
      rl.close();
      execSync('node src/review.js --mode new', { stdio: 'inherit' });
      return;
    case '3':
      rl.close();
      execSync('node src/review.js --mode overdue', { stdio: 'inherit' });
      return;
    case '4':
      rl.close();
      execSync('node src/stats.js', { stdio: 'inherit' });
      return;
    case '5':
      rl.close();
      execSync('node src/daily-plan.js', { stdio: 'inherit' });
      return;
    case '6':
      const limitStr = await ask('  Batch size: ');
      const limit = parseInt(limitStr.trim(), 10);
      if (!isNaN(limit) && limit > 0) {
        rl.close();
        execSync(`node src/review.js --mode all --limit ${limit}`, { stdio: 'inherit' });
      } else {
        await ask('  Invalid number. Press Enter to retry...');
        execSync('node index.js', { stdio: 'inherit' });
      }
      return;
    case 'q':
      rl.close();
      console.log('  Goodbye!');
      return;
    default:
      await ask('  Invalid choice. Press Enter to retry...');
      execSync('node index.js', { stdio: 'inherit' });
      return;
  }
}

mainMenu();
