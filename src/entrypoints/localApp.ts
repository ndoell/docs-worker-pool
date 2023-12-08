import {
  nextGenDeploy,
  nextGenHtml,
  nextGenParse,
  nextGenStage,
  oasPageBuild,
  persistenceModule,
  prepareBuildAndGetDependencies,
} from '../commands';
import { Job, Payload } from '../entities/job';

const fakePayload: Payload = {
  repoName: 'cloud-docs',
  project: 'cloud-docs',
  // directory: 'cloud-docs',
  jobType: '',
  source: '',
  action: '',
  branchName: 'master',
  isFork: false,
  repoOwner: '10gen',
  url: 'https://github.com/10gen/cloud-docs', // ???
  mutPrefix: 'docs-qa/atlas/mmeigs-build',
  prefix: '',
  includeInGlobalSearch: true,
} as Payload;
// Bucket??

const fakeJob: Job = {
  _id: '082u3roinswdf988888888',
  useWithBenchmark: true,
  payload: fakePayload,
  createdTime: new Date(),
  startTime: new Date(),
  title: '10gen/cloud-docs',
  user: 'mmeigs',
  mutPrefix: 'docs-qa/atlas/mmeigs-build',
  buildCommands: [],
  deployCommands: [],
  email: 'matt.meigs@mongodb.com',
  shouldGenerateSearchManifest: false,
  endTime: undefined,
  error: undefined,
  comMessage: undefined,
  logs: undefined,
  priority: undefined,
  result: undefined,
  status: null,
  manifestPrefix: undefined,
  pathPrefix: undefined,
  invalidationStatusURL: undefined,
  purgedUrls: undefined,
};

const logger = (message: string) => {
  console.log(message);
};

async function localApp() {
  const baseUrl = 'https://mongodbcom-cdn.website.staging.corp.mongodb.com';
  const bucket = 'docs-atlas-dotcomstg';

  const { repoName, project, mutPrefix, directory } = fakePayload;

  const buildDependencies = [
    {
      dependencies: [
        {
          url: 'https://raw.githubusercontent.com/mongodb/docs-worker-pool/meta/publishedbranches/docs-mongodb-internal.yaml',
          filename: 'published-branches.yaml',
        },
      ],
    },
    {
      buildDir: 'source/driver-examples',
      dependencies: [
        {
          url: 'https://raw.githubusercontent.com/mongodb/mongo-python-driver/master/test/test_examples.py',
          filename: 'test_examples.py',
        },
        {
          url: 'https://raw.githubusercontent.com/mongodb/motor/master/test/asyncio_tests/test_examples.py',
          filename: 'test_examples_motor.py',
        },
      ],
    },
  ];

  const { commitHash, patchId, bundlePath, commitBranch, hasRedirects, repoDir } = await prepareBuildAndGetDependencies(
    repoName,
    project,
    baseUrl,
    buildDependencies,
    logger,
    directory
  );

  console.log('repoDir ', repoDir);

  console.log('Begin snooty build...');
  const snootyBuildRes = await nextGenParse({ job: fakeJob, logger });

  console.log(snootyBuildRes.errorText);

  console.log('snooty build complete');

  console.log('Begin persistence-module');
  const persistenceModuleRes = await persistenceModule({ job: fakeJob, logger });
  console.log(persistenceModuleRes);
  console.log('persistence-module complete');

  console.log('Begin next-gen-html...');

  const nextGenHtmlRes = await nextGenHtml({ job: fakeJob, logger });
  console.log(nextGenHtmlRes.outputText);

  console.log('next-gen-html complete');

  console.log('Begin oas-page-build...');
  const siteUrl = mutPrefix ? `${baseUrl}/${mutPrefix}` : `${baseUrl}`;
  console.log('siteUrl: ', siteUrl);
  const oasPageBuildRes = await oasPageBuild({ job: fakeJob, logger });
  console.log('oas-page-build compelte');

  console.log(oasPageBuildRes);
  console.log('Begin next-gen-stage...');

  await nextGenStage({
    job: fakeJob,
    logger,
    bucket,
    url: baseUrl,
  });
  console.log('next-gen-stage complete');

  console.log('Begin next-gen-deploy...');
  const deployRes = await nextGenDeploy({
    hasConfigRedirects: hasRedirects,
    gitBranch: commitBranch,
    mutPrefix: mutPrefix || '',
    logger,
  });
  console.log(deployRes);
  console.log('next-gen-deploy complete');
  console.log('bundle Path: ', bundlePath);
}

localApp();
