import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App';

// Lesson registrations (side-effect imports — order = sidebar order)
import './lessons/S01E01.js';
import './lessons/S01E02.js';
import './lessons/S01E03.js';
import './lessons/S01E05.js';
import './lessons/S02E01.js';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
