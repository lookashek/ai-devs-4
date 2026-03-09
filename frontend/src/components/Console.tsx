import { useEffect, useRef } from 'react';
import { theme } from '../styles/theme';

export type LogLevel = 'info' | 'success' | 'error' | 'warn';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
}

interface ConsoleProps {
  logs: LogEntry[];
}

const LEVEL_LABELS: Record<LogLevel, string> = {
  info: 'INFO',
  success: ' OK ',
  error: 'ERR ',
  warn: 'WARN',
};

const LEVEL_CLASS: Record<LogLevel, { level: string; msg: string }> = {
  info: { level: theme.consoleLevelInfo, msg: theme.consoleMsgInfo },
  success: { level: theme.consoleLevelSuccess, msg: theme.consoleMsgSuccess },
  error: { level: theme.consoleLevelError, msg: theme.consoleMsgError },
  warn: { level: theme.consoleLevelWarn, msg: theme.consoleMsgWarn },
};

export function Console({ logs }: ConsoleProps): JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className={theme.consoleWrap}>
      {/* Console title bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-cyber-border/60 bg-cyber-black/40 shrink-0">
        <span className={theme.label}>console output</span>
        {logs.length > 0 && (
          <span className="ml-auto text-xs font-mono text-cyber-muted">{logs.length} lines</span>
        )}
      </div>

      {/* Log lines */}
      <div className={theme.consoleOutput}>
        {logs.length === 0 ? (
          <p className={theme.consolePlaceholder}>// awaiting execution...</p>
        ) : (
          logs.map(entry => {
            const cls = LEVEL_CLASS[entry.level];
            return (
              <div key={entry.id} className={theme.consoleRow}>
                <span className={theme.consoleTimestamp}>
                  {entry.timestamp.toLocaleTimeString('en-GB', { hour12: false })}
                </span>
                <span className={cls.level}>[{LEVEL_LABELS[entry.level]}]</span>
                <span className={cls.msg}>{entry.message}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
