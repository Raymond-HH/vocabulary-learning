# Vocabulary Learning System

Spaced repetition vocabulary learning system with Feishu Base integration.

## Architecture

```
Feishu Base (Cloud Storage)  <--->  Local CLI Tool (Learning Interface)
```

- **Feishu Base**: Stores all vocabulary data, with formula fields for review status and automatic workflows
- **Local CLI**: Provides quiz interface, spaced repetition scheduling, and statistics

## Quick Start

```bash
# Interactive menu
node index.js

# Direct commands
node src/review.js              # Review 20 words (default)
node src/review.js --mode new    # Learn new words only
node src/review.js --mode overdue  # Review overdue words
node src/review.js --limit 10   # Review 10 words
node src/stats.js               # Show learning statistics
node src/daily-plan.js           # Set initial review dates for new words
```

## Scoring System

During review sessions, score yourself 1-5:

| Score | Meaning | Effect |
|-------|---------|--------|
| 1 | Completely forgot | Mastery drops, review in 1 day |
| 2 | Barely remembered | Mastery stays low, review in 2 days |
| 3 | Knew it after thinking | Small progress |
| 4 | Knew it well | Mastery increases |
| 5 | Perfect recall | Mastery increases more |

## Spaced Repetition Schedule

| Mastery Level | Interval |
|---------------|----------|
| L0 - 陌生 (0%) | 1 day |
| L1 - 了解 (10%) | 2 days |
| L2 - 认识 (25%) | 4 days |
| L3 - 熟悉 (50%) | 8 days |
| L4 - 掌握 (75%) | 15 days |
| L5 - 熟练 (90%) | 30 days |
| L6 - 精通 (100%) | 60 days |

## Feishu Base Views

The Base has 5 pre-configured views:

| View | Purpose |
|------|---------|
| 表格 | All records (default) |
| 今日需复习 | Words due for review today |
| 新词待学 | Words not yet assigned a mastery level |
| 已超期 | Overdue words (past review date) |
| 按掌握程度分组 | Grouped by mastery level |
| 已精通 | Words at L6 mastery |

## Formula Fields

| Field | Purpose |
|-------|---------|
| reviewStatus | Auto-calculated: 新词 / 待复习 / 今日需复习 / 已超期 / 未到复习时间 |
| daysToReview | Days remaining until next review |

## Automation

- **Auto-init workflow** (`wkfmM3Xzh2UMcqrb`): Automatically sets new records to L0 mastery level
- **Daily plan**: Run `node src/daily-plan.js` to stagger new words across days

## Configuration

Edit `config.json` to customize:
- Base token and table ID
- Spaced repetition intervals
- Default batch size
- Field mappings
