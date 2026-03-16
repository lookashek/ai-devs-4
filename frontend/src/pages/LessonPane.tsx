import { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { theme } from '../styles/theme';
import { Console } from '../components/Console.js';
import type { LogEntry } from '../components/Console.js';
import { getLessonById, getLessons } from '../lessons/registry.js';

/**
 * Right-pane content for a lesson route (/lessons/:id).
 * Renders the lesson header, a scrollable Console, and an Execute button.
 */
export function LessonPane(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const lesson = id ? getLessonById(id) : getLessons()[0];

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [debugMode, setDebugMode] = useState<boolean>(() => {
    try { return localStorage.getItem('debugMode') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem('debugMode', String(debugMode)); } catch { /* noop */ }
  }, [debugMode]);

  const addLog = useCallback((message: string, level: LogEntry['level'] = 'info'): void => {
    setLogs(prev => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: new Date(),
        level,
        message,
      },
    ]);
  }, []);

  const handleExecute = async (): Promise<void> => {
    if (!lesson || running) return;
    setLogs([]);
    setRunning(true);
    addLog(`Starting ${lesson.id}: ${lesson.title}`, 'info');
    try {
      await lesson.execute(addLog);
      addLog('Execution complete.', 'success');
    } catch (err) {
      addLog(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setRunning(false);
    }
  };

  if (!lesson) {
    return (
      <div className={theme.paneBody}>
        <p className="text-cyber-muted font-mono text-sm">
          Lesson <span className="text-cyber-red">{id ?? '—'}</span> not found.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Pane header */}
      <div className={theme.paneHeader}>
        <p className={theme.label}>{lesson.id}</p>
        <h2 className={theme.heading2}>{lesson.title}</h2>
        {lesson.description !== undefined && (
          <p className="text-xs text-cyber-muted mt-1">{lesson.description}</p>
        )}
      </div>

      {/* Pane body */}
      <div className={theme.paneBody}>
        {/* Console fills remaining space */}
        <Console logs={logs} showDebug={debugMode} />

        {/* Execute button + debug toggle */}
        <div className="shrink-0 flex items-center gap-4">
          <button
            className={running ? theme.btnSecondary : theme.btnPrimary}
            onClick={() => void handleExecute()}
            disabled={running}
          >
            {running ? '⟳  Running...' : '▶  Execute'}
          </button>
          {logs.length > 0 && !running && (
            <button
              className={theme.btnSecondary}
              onClick={() => setLogs([])}
            >
              ✕  Clear
            </button>
          )}

          {/* Debug mode toggle — pushed to the right */}
          <label className={`${theme.debugToggle} ml-auto`}>
            <div
              className={`${theme.debugToggleSwitch} ${debugMode ? theme.debugToggleSwitchOn : theme.debugToggleSwitchOff}`}
              onClick={() => setDebugMode(prev => !prev)}
            >
              <div className={`${theme.debugToggleKnob} ${debugMode ? theme.debugToggleKnobOn : theme.debugToggleKnobOff}`} />
            </div>
            <span className={debugMode ? 'text-cyber-purple' : ''}>debug</span>
          </label>
        </div>
      </div>
    </>
  );
}
