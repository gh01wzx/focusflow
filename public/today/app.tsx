import { createRoot } from 'react-dom/client';
import { TodayApp } from './TodayApp.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<TodayApp />);
