import { Job } from '../../../entities/job';
import { executeCliCommand, getRepoDir } from '../helpers';

const DOCS_WORKER_USER = 'docsworker-xlarge';
interface StageParams {
  job: Job;
  logger: (message: string) => void;
  bucket?: string;
  url?: string;
}

export async function nextGenStage({ job, logger, bucket, url }: StageParams) {
  const { mutPrefix, branchName, patch, project, newHead } = job.payload;

  if (!bucket) {
    logger(`nextGenStage has failed. Variable for S3 bucket address was undefined.`);
    return {
      status: 'failure',
      output: 'Failed in nextGenDeploy: No value present for S3 bucket',
      error: 'No value present for S3 bucket.',
    };
  }
  if (!url) {
    logger(`nextGenStage has failed. Variable for URL address was undefined.`);
    return {
      status: 'failure',
      output: 'Failed in nextGenDeploy: No value present for target url.',
      error: 'No value present for URL.',
    };
  }

  let prefix = mutPrefix || project;
  // TODO: Figure out correct hostedAtUrl
  let hostedAtUrl = `${url}/${prefix}/${DOCS_WORKER_USER}/${branchName}/`;

  const commandArgs = ['public', bucket, '--stage'];

  if (patch && newHead && project === mutPrefix) {
    prefix = `${newHead}/${patch}/${mutPrefix}`;
    hostedAtUrl = `${url}/${newHead}/${patch}/${mutPrefix}/${DOCS_WORKER_USER}/${branchName}/`;
  }

  commandArgs.push(`--prefix=${prefix}`);

  const repoDir = getRepoDir(job.payload.repoName, job.payload.directory);
  try {
    await executeCliCommand({
      command: 'cp',
      args: ['-r', `${process.cwd()}/snooty/public`, repoDir],
    });

    const { outputText } = await executeCliCommand({
      command: 'mut-publish',
      args: commandArgs,
      options: {
        cwd: repoDir,
      },
      logger: logger,
    });

    const resultMessage = `${outputText}\n Hosted at ${hostedAtUrl}\n\nHere are the commands: ${commandArgs}`;
    logger(resultMessage);

    return {
      status: 'success',
      output: '',
      error: '',
    };
  } catch (error) {
    logger(`Failed in nextGenStage.`);
    return {
      status: 'failed',
      output: 'Failed in nextGenStage',
      error: 'Failed in nextGenStage',
    };
  }
}
