import type { AiModelSelection } from './ai.ts';

export interface ProjectSettings {
  revision: number;
  requirements: string;
  decisions: string;
  references: string;
  sourcePath: string;
  preview: string;
  tokenBudget?: number;
  planning?: AiModelSelection;
  execution?: AiModelSelection;
  review?: AiModelSelection;
}
export interface RepositoryContext {
  revision: string;
  files: { path: string; excerpt: string; truncated: boolean }[];
}

export const emptyProjectSettings: ProjectSettings = {
  revision: 0, requirements: '', decisions: '', references: '', sourcePath: '', preview: '',
};
