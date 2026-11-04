import { createRoot } from 'react-dom/client';
import { WorkspaceApp } from '../workspace/WorkspaceApp.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<WorkspaceApp />);
