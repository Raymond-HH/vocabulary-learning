#!/usr/bin/env node
import { config, larkBase } from './utils.js';

function clear() {
  process.stdout.write('\x1Bc');
}

/**
 * Daily plan: for words without nextReview, assign initial review dates
 * Stagger new words over multiple days to avoid overwhelming
 */
async function dailyPlan({ wordsPerDay = 10 } = {}) {
  // Fetch records without nextReview
  const result = larkBase('+record-list', { limit: 200 });
  if (!result || !result.data) {
    console.log('No records found.');
    return;
  }

  clear();
  console.log('  Daily Learning Plan');
  console.log('  '.padEnd(40, '='));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const recordIdList = result.record_id_list || [];

  let wordsNeedingPlan = [];
  for (let i = 0; i < result.data.length; i++) {
    const record = result.data[i];
    const nextReview = record[config.fields.nextReview];

    // Words that have never been assigned a nextReview date
    if (!nextReview) {
      wordsNeedingPlan.push({
        id: recordIdList[i],
        word: record[config.fields.word]
      });
    }
  }

  console.log(`\n  Words needing initial review date: ${wordsNeedingPlan.length}`);
  console.log(`  Planning ${wordsPerDay} words per day\n`);

  // Stagger over days
  let dayOffset = 0;
  let planned = 0;

  for (let i = 0; i < wordsNeedingPlan.length; i++) {
    const word = wordsNeedingPlan[i];
    const reviewDate = new Date(today);
    reviewDate.setDate(reviewDate.getDate() + dayOffset);

    const reviewDateMs = reviewDate.getTime();

    // Set initial mastery to L0 and first review tomorrow
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const firstReviewMs = tomorrow.getTime();

    const updateResult = larkBase('+record-upsert', {
      'record-id': word.id,
      json: {
        masteryLevel: 'L0-陌生 (0%)',
        nextReview: firstReviewMs,
        reviewCount: 0,
      }
    });

    if (updateResult) {
      planned++;
    }

    // Move to next day after wordsPerDay words
    if ((i + 1) % wordsPerDay === 0) {
      dayOffset++;
    }
  }

  console.log(`  Planned: ${planned} words`);
  console.log(`  Start date: ${today.toISOString().split('T')[0]}`);
  console.log(`  Staggered over: ${Math.ceil(planned / wordsPerDay)} days`);

  // Show today's review queue
  console.log('\n  Today\'s Review Queue:');
  console.log('  ' + '-'.repeat(40));

  const todayMs = today.getTime();
  const tomorrowMs = todayMs + 86400000;

  for (let i = 0; i < result.data.length; i++) {
    const record = result.data[i];
    const nextReview = record[config.fields.nextReview];

    if (nextReview !== null && nextReview !== undefined && nextReview < tomorrowMs) {
      const word = record[config.fields.word];
      const mastery = record[config.fields.masteryLevel] || 'Unset';
      console.log(`    - ${word.padEnd(35)} ${mastery}`);
    }
  }

  console.log('\n  ' + '='.repeat(60) + '\n');
}

// Parse CLI arguments
const args = process.argv.slice(2);
let wordsPerDay = 10;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--words-per-day' && args[i + 1]) {
    wordsPerDay = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
  Daily Plan - Assign initial review dates to new words

  Usage:
    node src/daily-plan.js [options]

  Options:
    --words-per-day <n>  Number of new words to introduce per day (default: 10)
    --help, -h           Show this help

  Examples:
    node src/daily-plan.js                  # Plan 10 words per day
    node src/daily-plan.js --words-per-day 5  # Plan 5 words per day
`);
    process.exit(0);
  }
}

dailyPlan({ wordsPerDay });
