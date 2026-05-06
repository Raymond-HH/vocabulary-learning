#!/usr/bin/env node
import { readFileSync } from 'fs';
import { createInterface } from 'readline';
import { config, larkBase, calculateNextReview, formatWord } from './utils.js';

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

function divider() {
  console.log('\n' + '='.repeat(60) + '\n');
}

function printWord(word) {
  console.log(`\n  Word:       ${word.word}`);
  if (word.phonetic) console.log(`  Phonetic:   ${word.phonetic}`);
  if (word.pos) console.log(`  POS:        ${word.pos}`);
  if (word.category) console.log(`  Category:   ${Array.isArray(word.category) ? word.category.join(', ') : word.category}`);
  if (word.difficulty) console.log(`  Difficulty: ${word.difficulty}`);
  if (word.masteryLevel) console.log(`  Mastery:    ${word.masteryLevel}`);
}

function printAnswer(word) {
  divider();
  console.log('  ANSWER');
  console.log('  ' + '-'.repeat(40));

  if (word.definition) {
    console.log(`\n  Definition:`);
    console.log(`  ${word.definition}`);
  }
  if (word.examples) {
    console.log(`\n  Examples:`);
    const examples = word.examples.replace(/\n\s*/g, '\n  ').trim();
    console.log(`  ${examples}`);
  }
  if (word.collocations) {
    console.log(`\n  Collocations:`);
    console.log(`  ${word.collocations}`);
  }
  if (word.synonyms) {
    console.log(`\n  Synonyms:`);
    console.log(`  ${word.synonyms}`);
  }
  if (word.wordFamily) {
    console.log(`\n  Word Family:`);
    console.log(`  ${word.wordFamily}`);
  }
  if (word.usageNotes) {
    console.log(`\n  Usage Notes:`);
    console.log(`  ${word.usageNotes}`);
  }
  console.log('\n');
}

async function reviewSession({ mode = 'all', limit = 20 } = {}) {
  clear();
  console.log('  Vocabulary Review - Spaced Repetition System');
  console.log('  '.padEnd(40, '='));

  // Fetch records
  let records = null;
  let label = '';

  if (mode === 'new') {
    label = 'New Words';
    records = larkBase('+record-list', { limit: 200 });
    if (records?.data) {
      // Filter to only new words (no masteryLevel)
      const masteryField = config.fields.masteryLevel;
      // We need to check via the record data
      records.data = records.data.filter(r => {
        const masteryValue = r[config.fields.masteryLevel];
        return !masteryValue || (Array.isArray(masteryValue) && masteryValue.length === 0);
      });
    }
  } else if (mode === 'overdue') {
    label = 'Overdue Review';
    records = larkBase('+record-list', { limit: 200 });
  } else {
    label = 'All Review Queue';
    records = larkBase('+record-list', { limit: Math.min(limit, 200) });
  }

  if (!records || !records.data || records.data.length === 0) {
    console.log('\n  No records found for review.\n');
    return;
  }

  // Convert array-format records to keyed objects
  const fieldNames = records.fields || [];
  const keyedRecords = records.data.map(r => {
    const obj = {};
    fieldNames.forEach((name, i) => { obj[name] = r[i]; });
    return obj;
  });

  // Filter and prepare records
  let reviewItems = [];
  const recordIdList = records.record_id_list || [];

  for (let i = 0; i < keyedRecords.length; i++) {
    const record = keyedRecords[i];
    const recordId = recordIdList[i];
    const word = formatWord(record, config.fields);

    // For non-new mode, only include records that have been reviewed before
    if (mode !== 'new' && !word.masteryLevel) continue;

    reviewItems.push({
      id: recordId,
      word,
      raw: record,
      masteryIndex: word.masteryLevel ?
        config.spacedRepetition.masteryLevels.findIndex(l => word.masteryLevel.includes(l.split('-')[0])) :
        0
    });
  }

  if (mode === 'new') {
    // For new words, filter to only unmastered
    reviewItems = reviewItems.filter(item => !item.word.masteryLevel);
  }

  if (reviewItems.length === 0) {
    console.log('\n  No records found for this mode.\n');
    return;
  }

  // Limit to requested batch size
  reviewItems = reviewItems.slice(0, limit);

  console.log(`\n  Mode:       ${label}`);
  console.log(`  Batch Size: ${reviewItems.length}`);
  console.log(`\n  Press Enter to start, Ctrl+C to quit\n`);

  await ask('  [Press Enter]');

  // Review loop
  let reviewed = 0;
  let totalScore = 0;
  const results = [];

  for (const item of reviewItems) {
    clear();
    console.log(`  Question ${reviewed + 1} / ${reviewItems.length}`);
    console.log('  '.padEnd(40, '-'));

    printWord(item.word);

    console.log('\n');
    console.log('  Think about the meaning, then press Enter to reveal...');
    await ask('  [Enter]');

    printAnswer(item.word);

    console.log('  Score yourself:');
    console.log('  1 - Completely forgot (had no idea)');
    console.log('  2 - Barely remembered');
    console.log('  3 - Knew it after thinking');
    console.log('  4 - Knew it well');
    console.log('  5 - Perfect recall');
    console.log('  q - Quit session');
    console.log('');

    const scoreInput = await ask('  Score (1-5): ').then(s => s.trim().toLowerCase());

    if (scoreInput === 'q') {
      console.log('\n  Session ended early.');
      break;
    }

    const score = parseInt(scoreInput, 10);
    if (isNaN(score) || score < 1 || score > 5) {
      console.log('  Invalid score. Skipping this word.');
      await ask('  [Press Enter]');
      continue;
    }

    // Calculate next review
    const currentMasteryIndex = item.masteryIndex;
    const reviewResult = calculateNextReview(currentMasteryIndex, score);

    // Prepare update data
    const today = new Date().toISOString().split('T')[0];
    const todayMs = new Date(today).getTime();
    const nextReviewMs = new Date(reviewResult.nextReviewDate).getTime();

    const updateData = {
      masteryLevel: reviewResult.masteryLevel,
      lastReviewed: todayMs,
      nextReview: nextReviewMs,
      reviewCount: (item.raw[config.fields.reviewCount] || 0) + 1,
    };

    // Update average score
    const oldAvg = item.raw[config.fields.averageScore] || 0;
    const oldCount = item.raw[config.fields.reviewCount] || 0;
    updateData.averageScore = parseFloat(((oldAvg * oldCount + score) / (oldCount + 1)).toFixed(1));

    // Update record
    const updateResult = larkBase('+record-upsert', {
      'record-id': item.id,
      json: updateData
    });

    if (updateResult) {
      reviewed++;
      totalScore += score;
      results.push({ word: item.word.word, score, masteryLevel: reviewResult.masteryLevel });
      console.log(`\n  Updated -> ${reviewResult.masteryLevel}, next review: ${reviewResult.nextReviewDate}`);
    } else {
      console.log('\n  Failed to update record. Continuing...');
    }

    await ask('  [Press Enter for next word]');
  }

  // Summary
  clear();
  console.log('  Session Summary');
  console.log('  '.padEnd(40, '='));
  console.log(`  Words reviewed: ${reviewed}`);
  if (reviewed > 0) {
    console.log(`  Average score:  ${(totalScore / reviewed).toFixed(1)} / 5`);
    console.log('\n  Results:');
    for (const r of results) {
      const scoreIcon = r.score >= 4 ? '+' : r.score >= 3 ? '~' : '!';
      console.log(`    ${scoreIcon} ${r.word.padEnd(35)} Score: ${r.score}  -> ${r.masteryLevel}`);
    }
  }
  console.log('\n  ' + '='.repeat(60) + '\n');

  rl.close();
}

// Parse CLI arguments
const args = process.argv.slice(2);
let mode = 'all';
let limit = config.reviewDefaults.batchSize;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--mode' && args[i + 1]) {
    mode = args[i + 1];
    i++;
  } else if (args[i] === '--limit' && args[i + 1]) {
    limit = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
  Vocabulary Review Tool - Spaced Repetition

  Usage:
    node src/review.js [options]

  Options:
    --mode <mode>    Review mode: all | new | overdue (default: all)
    --limit <n>      Number of words per batch (default: 20)
    --help, -h       Show this help

  Scoring:
    1 - Completely forgot
    2 - Barely remembered
    3 - Knew it after thinking
    4 - Knew it well
    5 - Perfect recall

  Examples:
    node src/review.js                    # Review 20 words (default)
    node src/review.js --mode new          # Learn new words only
    node src/review.js --mode overdue      # Review overdue words
    node src/review.js --limit 10          # Review 10 words
    node src/review.js --mode new --limit 5  # Learn 5 new words
`);
    process.exit(0);
  }
}

if (!['all', 'new', 'overdue'].includes(mode)) {
  console.error(`Invalid mode: ${mode}. Must be one of: all, new, overdue`);
  process.exit(1);
}

reviewSession({ mode, limit });
