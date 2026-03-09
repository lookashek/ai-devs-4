# Lesson Implementation Instructions

Use this guide when implementing a new AI Devs 4 lesson solution.

## Checklist

- [ ] Read the task description from the course
- [ ] Check `general/README.md` for existing utilities
- [ ] Create `lessons/S0XEY/README.md` with task + approach
- [ ] Implement `lessons/S0XEY/index.ts`
- [ ] Submit answer to Hub API and record the flag
- [ ] Move any reusable code to `/general` and update `general/README.md`

## Lesson Directory Structure

```
lessons/S01E01/
├── README.md       # Task description, approach, flag (if obtained)
├── index.ts        # Main solution entry point
└── package.json    # Only if the lesson needs its own deps
```

## README.md Template for a Lesson

```markdown
# S01E01 — <Task Title>

## Task

<What the task asks for>

## Approach

<How it was solved — steps taken, models/tools used>

## Result

Flag: `{FLG:...}` (or "pending")

## Reusable Patterns

<Any modules moved to /general or patterns worth noting>
```

## Running a Lesson

```bash
npx ts-node --esm lessons/S01E01/index.ts
```

## Submitting to Hub API

```typescript
import { submitAnswer } from '../../general/src/index.js';

const result = await submitAnswer({ task: 'task-name', answer: myAnswer });
console.log(result.message); // {FLG:...} on success
```
