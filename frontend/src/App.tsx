import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout.js';
import { HealthCheck } from './pages/HealthCheck.js';
import { LessonPane } from './pages/LessonPane.js';

/**
 * Root application — sets up the router tree.
 *
 * Route structure:
 *   /              → redirect to /health
 *   /health        → Health Check pane
 *   /lessons/:id   → Lesson execution pane
 *
 * All routes are nested inside MainLayout which renders the sidebar.
 * To add a new lesson, register it via registerLesson() in registry.ts
 * and add its execute logic — no router changes needed.
 */
export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<Navigate to="/health" replace />} />
          <Route path="health" element={<HealthCheck />} />
          <Route path="lessons/:id" element={<LessonPane />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
