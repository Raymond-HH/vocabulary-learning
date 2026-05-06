import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const config = JSON.parse(
  readFileSync(join(__dirname, '..', 'config.json'), 'utf-8')
);

/**
 * Run a lark-cli base command and return parsed JSON result
 */
export function larkBase(command, args = {}) {
  const parts = [
    `base ${command}`,
    `--base-token ${config.baseToken}`,
  ];

  // data-query doesn't use --table-id, table is in the DSL
  if (command !== '+data-query') {
    parts.push(`--table-id ${config.tableId}`);
  }

  for (const [key, value] of Object.entries(args)) {
    if (value !== undefined && value !== null) {
      if (typeof value === 'object') {
        parts.push(`--${key} '${JSON.stringify(value).replace(/'/g, "'\\''")}'`);
      } else {
        parts.push(`--${key} ${value}`);
      }
    }
  }

  const fullCommand = `lark-cli ${parts.join(' ')}`;

  try {
    const output = execSync(fullCommand, { encoding: 'utf-8', timeout: 30000 });
    const result = JSON.parse(output);
    if (!result.ok) {
      console.error('Command failed:', JSON.stringify(result.error, null, 2));
      return null;
    }
    return result.data;
  } catch (err) {
    if (err.stdout) {
      // Try to extract JSON from output even if exit code was non-zero
      try {
        const jsonStart = err.stdout.indexOf('{');
        if (jsonStart >= 0) {
          const result = JSON.parse(err.stdout.slice(jsonStart));
          if (result.ok === false) {
            console.error('Command failed:', result.error?.message || JSON.stringify(result.error));
          }
          return result.data;
        }
      } catch {
        // Fall through to throw
      }
    }
    console.error(`Error running: ${fullCommand}`);
    console.error(err.message);
    return null;
  }
}

/**
 * Get all records due for review (nextReview <= today or nextReview is blank)
 */
export function getDueRecords(limit = config.reviewDefaults.batchSize) {
  return larkBase('+record-list', { limit });
}

/**
 * Get records with nextReview <= today (overdue or due today)
 */
export function getOverdueDueRecords(limit = 50) {
  // First get all records, then filter client-side for date comparison
  return larkBase('+record-list', { limit });
}

/**
 * Get new words (no masteryLevel set)
 */
export function getNewWords(limit = 20) {
  return larkBase('+record-list', { limit });
}

/**
 * Get total record count
 */
export function getTotalCount() {
  return larkBase('+data-query', {
    dsl: { table_name: '词汇表', select: [], aggregate: [{ func: 'count' }] }
  });
}

/**
 * Update a record's review-related fields
 * @param {string} recordId - The record ID
 * @param {object} updates - Fields to update
 */
export function updateRecord(recordId, updates) {
  return larkBase('+record-upsert', {
    'record-id': recordId,
    json: updates
  });
}

/**
 * Calculate the next review date based on mastery level and quiz score
 * @param {number} currentMasteryIndex - Current mastery level index (0-6)
 * @param {number} quizScore - Quiz score (1-5)
 * @returns {object} - { masteryLevel, intervalDays, nextReviewDate }
 */
export function calculateNextReview(currentMasteryIndex, quizScore) {
  const intervals = config.spacedRepetition.intervals;
  const masteryLevels = config.spacedRepetition.masteryLevels;

  // Score affects mastery: 1=decrease, 2=same, 3=same, 4=increase, 5=increase more
  let newMasteryIndex = currentMasteryIndex;
  if (quizScore <= 1) {
    newMasteryIndex = Math.max(0, currentMasteryIndex - 1);
  } else if (quizScore >= 4) {
    newMasteryIndex = Math.min(6, currentMasteryIndex + 1);
  }

  // Determine interval based on new mastery level
  const intervalDays = intervals[Math.min(newMasteryIndex, intervals.length - 1)];
  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + intervalDays);

  return {
    masteryLevel: masteryLevels[newMasteryIndex],
    intervalDays,
    nextReviewDate: nextReviewDate.toISOString().split('T')[0]
  };
}

/**
 * Format a record for display during quiz
 */
export function formatWord(record, fields) {
  const getValue = (fieldName) => {
    const fid = Object.keys(fields).find(k => fields[k] === fieldName);
    if (!fid) return null;
    return record[fid];
  };

  return {
    word: record[fields.word],
    phonetic: record[fields.phonetic],
    pos: record[fields.pos],
    definition: record[fields.definition],
    examples: record[fields.examples],
    collocations: record[fields.collocations],
    synonyms: record[fields.synonyms],
    wordFamily: record[fields.wordFamily],
    usageNotes: record[fields.usageNotes],
    category: record[fields.category],
    masteryLevel: record[fields.masteryLevel],
    difficulty: record[fields.difficulty]
  };
}
