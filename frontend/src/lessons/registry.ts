import type { LogLevel } from '../components/Console.js';

/**
 * Callback passed to lesson.execute() — call it to emit a log line into the Console.
 *
 * @param message - Human-readable log message
 * @param level   - Severity level (defaults to 'info')
 */
export type AddLog = (message: string, level?: LogLevel) => void;

/**
 * Metadata about a lesson shown in the sidebar.
 */
export interface LessonMeta {
  /** Lesson identifier, e.g. 'S01E01'. Used as URL slug and sidebar label. */
  id: string;
  /** Short human-readable title shown in the sidebar and pane header. */
  title: string;
  /** Optional one-liner description shown below the title in the pane header. */
  description?: string;
}

/**
 * Full lesson definition — metadata + the execute function.
 * Register via `registerLesson()` so it appears automatically in the UI.
 */
export interface Lesson extends LessonMeta {
  /**
   * Called when the user clicks "Execute". Should emit progress via addLog.
   * Any thrown error is caught by the pane and shown as an 'error' log line.
   */
  execute: (addLog: AddLog) => Promise<void>;
}

const registry: Lesson[] = [];

/** Register a lesson so it appears in the sidebar and can be executed. */
export function registerLesson(lesson: Lesson): void {
  registry.push(lesson);
}

/** Returns all registered lessons in registration order. */
export function getLessons(): readonly Lesson[] {
  return registry;
}

/** Look up a lesson by its id. Returns undefined if not found. */
export function getLessonById(id: string): Lesson | undefined {
  return registry.find(l => l.id === id);
}
