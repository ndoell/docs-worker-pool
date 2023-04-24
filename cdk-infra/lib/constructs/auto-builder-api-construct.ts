import { Cors, CorsOptions, LambdaIntegration, LambdaRestApi } from 'aws-cdk-lib/aws-apigateway';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

const HANDLERS_PATH = '../build/api/controllers/v1/handlers';

export class AutoBuilderApiConstruct extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const dbName = StringParameter.valueFromLookup(this, '/env/dev/docs/worker_pool/atlas/dbname');

    const slackTriggerName = 'slackTriggerLambda';

    const slackTriggerLambda = new Function(this, slackTriggerName, {
      code: Code.fromAsset(`${HANDLERS_PATH}/slackTrigger.zip`),
      runtime: Runtime.NODEJS_14_X,
      handler: slackTriggerName,
      environment: {
        DB_NAME: dbName,
      },
    });

    const fastlyDochubToken = StringParameter.valueFromLookup(
      this,
      '/env/dev/docs/worker_pool/fastly/docs/dochub/token'
    );
    const fastlyDochubServiceId = StringParameter.valueFromLookup(
      this,
      '/env/dev/docs/worker_pool/fastly/docs/dochub/service_id'
    );
    const fastlyDochubMap = StringParameter.valueFromLookup(this, '/env/dev/docs/worker_pool/fastly/dochub_map');

    const dochubTriggerName = 'dochubTriggerLambda';

    const dochubTriggerLambda = new Function(this, dochubTriggerName, {
      code: Code.fromAsset(`${HANDLERS_PATH}/dochubTriggerUpsert.zip`),
      runtime: Runtime.NODEJS_14_X,
      handler: dochubTriggerName,

      environment: {
        FASTLY_DOCHUB_MAP: fastlyDochubMap,
        FASTLY_DOCHUB_SERVICE_ID: fastlyDochubServiceId,
        FASTLY_DOCHUB_TOKEN: fastlyDochubToken,
      },
    });

    const githubTriggerName = 'githubTriggerLambda';

    const githubTriggerLambda = new Function(this, githubTriggerName, {
      code: Code.fromAsset(`${HANDLERS_PATH}/githubTriggerBuild.zip`),
      runtime: Runtime.NODEJS_14_X,
      handler: githubTriggerName,
    });

    // generic handler for the root endpoint
    const rootEndpointLambda = new Function(this, 'RootEndpointLambda', {
      code: Code.fromInline('exports.default = (event) => { console.log("hello, world!!"); }'),
      runtime: Runtime.NODEJS_14_X,
      handler: 'RootEndpointLambda',
    });

    const restApi = new LambdaRestApi(this, 'webhookHandlers', {
      handler: rootEndpointLambda,
      proxy: false,
    });

    const controllersEndpoint = restApi.root.addResource('controllers');
    const v1Endpoint = controllersEndpoint.addResource('v1');

    const defaultCorsPreflightOptions: CorsOptions = {
      allowOrigins: Cors.ALL_ORIGINS,
    };

    const slackEndpoint = v1Endpoint.addResource('slack', { defaultCorsPreflightOptions });
    const dochubEndpoint = v1Endpoint.addResource('dochub', { defaultCorsPreflightOptions });
    const githubEndpoint = v1Endpoint.addResource('githubEndpoint', { defaultCorsPreflightOptions });

    // add resources and post methods for trigger endpoints
    slackEndpoint.addResource('trigger').addMethod('POST', new LambdaIntegration(slackTriggerLambda));
    dochubEndpoint.addResource('trigger').addMethod('POST', new LambdaIntegration(dochubTriggerLambda));
    githubEndpoint.addResource('trigger').addMethod('POST', new LambdaIntegration(githubTriggerLambda));

    const jobQueue = new Queue(this, 'JobQueue');

    // grant permission for lambdas to enqueue messages to the queue
    jobQueue.grantSendMessages(slackTriggerLambda);
    jobQueue.grantSendMessages(dochubTriggerLambda);
    jobQueue.grantSendMessages(githubTriggerLambda);
  }
}
