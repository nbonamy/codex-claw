import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import product from '../core/src/product.json' with { type: 'json' };
import { listTarget, targets } from './release-artifacts.mjs';
import { extractReleaseSections } from './release-notes.mjs';

// The final job of the build workflow: stage installers on a draft, then flip it to the requested channel.
export async function publishDesktop({ directory, tag, channel, changelog, run = execFileSync }) {
  if (!['prerelease', 'latest'].includes(channel)) throw new Error('Publication requires the prerelease or latest channel.');
  const notes = extractReleaseSections(changelog).find(release => release.version === tag.slice(1))?.markdown;
  if (!notes) throw new Error(`Missing changelog notes for ${tag}.`);
  const gh = args => run('gh', [...args, '--repo', product.repository], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 900_000 });
  const view = () => JSON.parse(gh(['release', 'view', tag, '--json', 'isDraft,isPrerelease']));
  const files = (await Promise.all(targets.map(target => listTarget(path.join(directory, `desktop-${target}`), target)))).flat();

  let release;
  try { release = view(); }
  catch (error) {
    if (!/not found|HTTP 404/i.test(String(error.stderr ?? error.message))) throw error;
    gh(['release', 'create', tag, '--verify-tag', '--draft', '--prerelease', '--latest=false', '--title', `${product.name} ${tag.slice(1)}`,
      '--notes', notes]);
    release = view();
  }
  // Published assets are never replaced; an interrupted run leaves a draft that a rerun completes.
  if (!release.isDraft) throw new Error(`${tag} is already published; bump the version to release again.`);

  gh(['release', 'upload', tag, ...files, '--clobber']);
  gh(['release', 'edit', tag, '--notes', notes, '--draft=false', ...(channel === 'latest' ? ['--prerelease=false', '--latest'] : ['--prerelease', '--latest=false'])]);
  const published = view();
  if (published.isDraft || published.isPrerelease !== (channel === 'prerelease')) throw new Error('Release visibility does not match the requested channel.');
  console.log(`Published ${channel}: ${product.repositoryUrl}/releases/tag/${tag}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const task = process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY === product.repository
    ? publishDesktop({ directory: path.resolve(process.argv[2] ?? 'out/downloaded'), tag: process.env.GITHUB_REF_NAME,
      channel: process.env.RELEASE_CHANNEL, changelog: fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8') })
    : Promise.reject(new Error('Publication runs in the build workflow. Use npm run prerelease or npm run latest.'));
  task.catch(error => { console.error(error.stderr?.toString() || error.message); process.exitCode = 1; });
}
