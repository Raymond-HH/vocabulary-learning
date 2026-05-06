#!/usr/bin/env node
import { config, larkBase } from './utils.js';

function clear() {
  process.stdout.write('\x1Bc');
}

async function showStats() {
  // Fetch all records (need pagination for large bases)
  const allRecords = [];
  let offset = null;

  do {
    const result = larkBase('+record-list', { limit: 200, offset });
    if (!result || !result.data) break;

    const recordIdList = result.record_id_list || [];
    for (let i = 0; i < result.data.length; i++) {
      const record = result.data[i];
      allRecords.push({
        id: recordIdList[i],
        data: record
      });
    }
    offset = result.offset;
  } while (offset);

  clear();
  console.log('  Vocabulary Learning - Statistics');
  console.log('  '.padEnd(40, '='));

  // Total words
  console.log(`\n  Total words: ${allRecords.length}`);

  // Mastery level distribution
  const masteryCounts = {};
  config.spacedRepetition.masteryLevels.forEach(level => {
    masteryCounts[level] = 0;
  });
  masteryCounts['Unset'] = 0;

  for (const record of allRecords) {
    const mastery = record.data[config.fields.masteryLevel];
    if (!mastery || (Array.isArray(mastery) && mastery.length === 0)) {
      masteryCounts['Unset']++;
    } else {
      const level = Array.isArray(mastery) ? mastery[0] : mastery;
      // Match the closest mastery level
      const matchedLevel = config.spacedRepetition.masteryLevels.find(l => level.includes(l.split('-')[0]));
      if (matchedLevel) {
        masteryCounts[matchedLevel]++;
      } else {
        masteryCounts['Unset']++;
      }
    }
  }

  console.log('\n  Mastery Level Distribution:');
  console.log('  ' + '-'.repeat(40));

  const barMax = Math.max(...Object.values(masteryCounts), 1);
  for (const level of [...config.spacedRepetition.masteryLevels, 'Unset']) {
    const count = masteryCounts[level];
    const barLength = Math.round((count / barMax) * 30);
    const bar = '#'.repeat(barLength);
    const label = level.padEnd(20);
    console.log(`    ${label} ${count.toString().padStart(4)}  ${bar}`);
  }

  // Category distribution
  const categoryCounts = {};
  const masteryField = config.fields.masteryLevel;
  for (const record of allRecords) {
    const category = record.data[config.fields.category];
    if (category && Array.isArray(category)) {
      for (const cat of category) {
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      }
    }
  }

  console.log('\n  Category Distribution (top 10):');
  console.log('  ' + '-'.repeat(40));
  const sortedCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (sortedCategories.length === 0) {
    console.log('    (no categories set)');
  } else {
    for (const [cat, count] of sortedCategories) {
      console.log(`    ${cat.padEnd(30)} ${count}`);
    }
  }

  // Review statistics
  let totalReviews = 0;
  let totalScore = 0;
  let reviewedWords = 0;

  for (const record of allRecords) {
    const reviewCount = record.data[config.fields.reviewCount] || 0;
    const avgScore = record.data[config.fields.averageScore] || 0;
    if (reviewCount > 0) {
      totalReviews += reviewCount;
      totalScore += avgScore * reviewCount;
      reviewedWords++;
    }
  }

  console.log('\n  Review Statistics:');
  console.log('  ' + '-'.repeat(40));
  console.log(`    Words reviewed at least once: ${reviewedWords}`);
  console.log(`    Total review sessions:        ${totalReviews}`);
  if (reviewedWords > 0) {
    console.log(`    Average score:                ${(totalScore / totalReviews).toFixed(2)} / 5`);
  }

  // Today's review due
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  let dueToday = 0;
  let overdue = 0;

  for (const record of allRecords) {
    const nextReview = record.data[config.fields.nextReview];
    if (nextReview) {
      if (nextReview < todayMs) {
        overdue++;
      } else if (nextReview === todayMs) {
        dueToday++;
      }
    }
  }

  console.log('\n  Review Schedule:');
  console.log('  ' + '-'.repeat(40));
  console.log(`    Overdue:          ${overdue}`);
  console.log(`    Due today:        ${dueToday}`);
  console.log(`    Total due:        ${overdue + dueToday}`);

  console.log('\n  ' + '='.repeat(60) + '\n');
}

showStats();
