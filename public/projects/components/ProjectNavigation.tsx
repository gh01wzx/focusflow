import { t } from '../../workspace/locale.ts';
import type { Project } from '../../../src/shared/projects.ts';

interface ProjectNavigationProps {
  projects: Project[];
  selectedId?: string | undefined;
  overview?: boolean;
  busy: boolean;
  onOverview(): void;
  onProject(id: string): void;
  onNewProject(): void;
}

export function ProjectNavigation({ projects, selectedId, overview, busy, onOverview, onProject, onNewProject }: ProjectNavigationProps) {
  return <div className="project-navigation">
    <nav aria-label={t("Project views")}>
      <button className={`nav-item ${overview ? 'active' : ''}`} aria-current={overview ? 'page' : undefined}
        disabled={busy} onClick={onOverview}>{t("Action center")}</button>
    </nav>
    <p className="project-nav-label">{t("YOUR PROJECTS")}</p>
    <nav aria-label={t("Project list")}>
      {projects.map(project => <button key={project.id}
        className={`nav-item ${selectedId === project.id ? 'active' : ''}`}
        aria-current={selectedId === project.id ? 'page' : undefined} disabled={busy}
        onClick={() => onProject(project.id)}>{project.title}</button>)}
    </nav>
    <button className="nav-item new-project-link" disabled={busy} onClick={onNewProject}>
      <span aria-hidden="true">+</span> {t("New project")}
    </button>
  </div>;
}
