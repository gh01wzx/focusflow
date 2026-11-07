import type { ProjectTicket } from '../../../src/shared/projects.ts';
import type { GitHubRepository } from '../../../src/shared/github.ts';

export function CodingNotice({ ticket, repository }: { ticket: ProjectTicket; repository?: GitHubRepository | null | undefined }) {
  if (ticket.executionMode !== 'codex') return null;
  const linked = ticket.coding?.repository;
  const issue = ticket.coding?.issueNumber;
  return <div className="coding-notice">
    <strong>{issue ? 'Coding task / Published' : 'Coding draft / Unpublished'}</strong>
    <p>{(linked ?? repository)?.fullName ?? 'No repository connected. Connect one in GitHub connection.'}</p>
    {issue && linked && <a href={'https://github.com/' + linked.fullName + '/issues/' + issue}
      target="_blank" rel="noreferrer">Open GitHub Issue #{issue}</a>}
    <p>{issue ? 'Work type and repository are fixed. Coding Start is not available yet.'
      : 'Saved locally. No GitHub Issue or coding run exists. Start and Done stay unavailable.'}</p>
  </div>;
}
