import { executeCliCommand } from '../commands/src/helpers';
import { nextGenParse } from '../commands/src/shared/next-gen-parse';
import { nextGenHtml } from '../commands/src/shared/next-gen-html';
import { getCliBuildDependencies } from '../commands/src/helpers/execution-helper';

async function localApp() {
  const repoName = 'docs-landing';
  const { repoDir, commitHash, patchId } = await getCliBuildDependencies(repoName);

  await executeCliCommand({
    command: 'git',
    args: ['clone', `https://github.com/mongodb/${repoName}`],
    options: { cwd: repoDir },
  });

  console.log('Hello');
  console.log('Begin snooty build...');
  const snootyBuildRes = await nextGenParse({ repoDir, commitHash, patchId });

  console.log(snootyBuildRes.errorText);

  console.log('snooty build complete');

  console.log('Begin next-gen-html...');

  const nextGenHtmlRes = await nextGenHtml(repoName);

  console.log(nextGenHtmlRes.outputText);

  console.log('next-gen-html complete');

  console.log('Begin next-gen-stage...');
}

localApp();
