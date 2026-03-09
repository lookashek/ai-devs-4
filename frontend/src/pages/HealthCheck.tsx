import { useEffect, useState } from 'react';
import { theme } from '../styles/theme';

type ServiceStatus = 'online' | 'offline' | 'pending';

interface Service {
  name: string;
  status: ServiceStatus;
  latency?: number;
}

const SERVICES_INITIAL: Service[] = [
  { name: 'Frontend', status: 'pending' },
  { name: 'Hub API', status: 'pending' },
  { name: 'OpenAI', status: 'pending' },
  { name: 'Anthropic', status: 'pending' },
];

function StatusDot({ status }: { status: ServiceStatus }): JSX.Element {
  const cls =
    status === 'online' ? theme.dotOnline
    : status === 'offline' ? theme.dotOffline
    : theme.dotPending;
  return <span className={cls} />;
}

function StatusBadge({ status }: { status: ServiceStatus }): JSX.Element {
  const cls =
    status === 'online' ? theme.badgeOnline
    : status === 'offline' ? theme.badgeOffline
    : theme.badgePending;
  const label = status === 'pending' ? 'checking' : status;
  return <span className={cls}>{label}</span>;
}

function ServiceRow({ service }: { service: Service }): JSX.Element {
  return (
    <div className="flex items-center justify-between py-3 border-b border-cyber-border last:border-0">
      <div className="flex items-center gap-3">
        <StatusDot status={service.status} />
        <span className="text-sm font-mono text-cyber-text">{service.name}</span>
      </div>
      <div className="flex items-center gap-3">
        {service.latency !== undefined && (
          <span className="text-xs font-mono text-cyber-muted">{service.latency}ms</span>
        )}
        <StatusBadge status={service.status} />
      </div>
    </div>
  );
}

async function checkHubApi(): Promise<{ status: ServiceStatus; latency: number }> {
  const start = Date.now();
  try {
    const res = await fetch('/api/hub/health', { signal: AbortSignal.timeout(5000) });
    const data = await res.json() as { status: ServiceStatus; latency: number };
    return data;
  } catch {
    return { status: 'offline', latency: Date.now() - start };
  }
}

/**
 * Health check pane — embedded inside MainLayout via the /health route.
 * Renders service status cards without a full-page wrapper.
 */
export function HealthCheck(): JSX.Element {
  const [services, setServices] = useState<Service[]>(SERVICES_INITIAL);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const runChecks = async (): Promise<void> => {
    setServices(SERVICES_INITIAL);

    setServices(prev =>
      prev.map(s => (s.name === 'Frontend' ? { ...s, status: 'online', latency: 0 } : s)),
    );

    const hub = await checkHubApi();
    setServices(prev =>
      prev.map(s => (s.name === 'Hub API' ? { ...s, ...hub } : s)),
    );

    setServices(prev =>
      prev.map(s =>
        s.name === 'OpenAI' || s.name === 'Anthropic'
          ? { ...s, status: 'pending' }
          : s,
      ),
    );

    setCheckedAt(new Date());
  };

  useEffect(() => {
    void runChecks();
  }, []);

  const allOnline = services.every(s => s.status === 'online');
  const anyOffline = services.some(s => s.status === 'offline');
  const overallStatus: ServiceStatus = anyOffline ? 'offline' : allOnline ? 'online' : 'pending';

  return (
    <>
      {/* Pane header */}
      <div className={theme.paneHeader}>
        <p className={theme.label}>[SYS]</p>
        <h2 className={theme.heading2}>Health Check</h2>
        <div className="flex items-center gap-2 mt-1">
          <StatusDot status={overallStatus} />
          <span className="text-xs font-mono text-cyber-muted">
            {overallStatus === 'online'
              ? 'All systems operational'
              : overallStatus === 'offline'
                ? 'Degraded performance'
                : 'Running diagnostics...'}
          </span>
        </div>
      </div>

      {/* Pane body */}
      <div className={theme.paneScrollable}>
        {/* Services card */}
        <div className={theme.cardGlow}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={theme.heading2}>Services</h2>
            <span className={theme.label}>
              {checkedAt ? `last check ${checkedAt.toLocaleTimeString()}` : 'checking...'}
            </span>
          </div>
          <div>
            {services.map(service => (
              <ServiceRow key={service.name} service={service} />
            ))}
          </div>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div className={theme.card}>
            <p className={`${theme.label} mb-2`}>environment</p>
            <p className="font-mono text-cyber-cyan text-sm">{import.meta.env.MODE}</p>
          </div>
          <div className={theme.card}>
            <p className={`${theme.label} mb-2`}>version</p>
            <p className="font-mono text-cyber-cyan text-sm">v0.1.0</p>
          </div>
        </div>

        {/* Refresh button */}
        <div className="mt-6">
          <button className={theme.btnPrimary} onClick={() => void runChecks()}>
            ↺ &nbsp;Refresh
          </button>
        </div>
      </div>
    </>
  );
}
