import { NavLink, Outlet } from 'react-router-dom';
import { theme } from '../styles/theme';
import { getLessons } from '../lessons/registry.js';

function SidebarLink({
  to,
  id,
  title,
}: {
  to: string;
  id: string;
  title: string;
}): JSX.Element {
  return (
    <NavLink to={to} end>
      {({ isActive }) => (
        <div className={isActive ? theme.sidebarItemActive : theme.sidebarItem}>
          <p className={theme.sidebarItemId}>{id}</p>
          <p className={isActive ? theme.sidebarItemTitleActive : theme.sidebarItemTitle}>{title}</p>
        </div>
      )}
    </NavLink>
  );
}

/**
 * Root layout — renders the sidebar navigation + an <Outlet> for the active pane.
 * All routes that should show the sidebar must be nested under this layout.
 */
export function MainLayout(): JSX.Element {
  const lessons = getLessons();

  return (
    <div className={theme.appShell}>
      {/* ── Sidebar ───────────────────────────────────────────────────── */}
      <aside className={theme.sidebar}>
        {/* Brand header */}
        <div className={theme.sidebarHeader}>
          <p className={theme.label}>workspace</p>
          <h1 className="text-cyber-cyan font-mono text-sm font-bold tracking-widest uppercase mt-1">
            AI Devs 4
          </h1>
        </div>

        {/* Navigation */}
        <nav className={theme.sidebarList}>
          {/* System section */}
          <SidebarLink to="/health" id="[SYS]" title="Health Check" />

          {/* Lessons section */}
          {lessons.length > 0 && (
            <>
              <div className="px-4 pt-4 pb-1">
                <p className={theme.label}>lessons</p>
              </div>
              {lessons.map(lesson => (
                <SidebarLink
                  key={lesson.id}
                  to={`/lessons/${lesson.id}`}
                  id={lesson.id}
                  title={lesson.title}
                />
              ))}
            </>
          )}

          {lessons.length === 0 && (
            <div className="px-4 pt-4">
              <p className={theme.label}>lessons</p>
              <p className="text-xs text-cyber-muted italic mt-2">No lessons registered yet.</p>
            </div>
          )}
        </nav>
      </aside>

      {/* ── Main content (swapped by router) ──────────────────────────── */}
      <main className={theme.pane}>
        <Outlet />
      </main>
    </div>
  );
}
