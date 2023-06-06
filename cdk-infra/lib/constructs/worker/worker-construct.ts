import { GatewayVpcEndpointAwsService, InterfaceVpcEndpointAwsService, Vpc } from 'aws-cdk-lib/aws-ec2';
import {
  AssetImageProps,
  Cluster,
  ContainerImage,
  FargateService,
  FargateTaskDefinition,
  LogDrivers,
} from 'aws-cdk-lib/aws-ecs';
import { Effect, IRole, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { IQueue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import path from 'path';

interface WorkerConstructProps {
  environment: Record<string, string>;
  jobsQueue: IQueue;
  jobUpdatesQueue: IQueue;
}
export class WorkerConstruct extends Construct {
  readonly ecsTaskRole: IRole;
  readonly taskDefinitionArn: string;
  constructor(scope: Construct, id: string, { environment, jobsQueue, jobUpdatesQueue }: WorkerConstructProps) {
    super(scope, id);

    const isEnhanced = !!this.node.tryGetContext('enhanced');

    const vpc = new Vpc(this, 'vpc', {
      gatewayEndpoints: {
        S3: { service: GatewayVpcEndpointAwsService.S3 },
      },
    });

    vpc.addInterfaceEndpoint('EcrDockerEndpoint', {
      service: InterfaceVpcEndpointAwsService.ECR_DOCKER,
    });

    vpc.addInterfaceEndpoint('EcrApiEndpoint', {
      service: InterfaceVpcEndpointAwsService.ECR,
    });

    const cluster = new Cluster(this, 'cluster', {
      vpc,
      enableFargateCapacityProviders: true,
      containerInsights: true,
    });

    const taskRoleSsmPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['ssm:GetParameter'],
      resources: ['*'],
    });

    const taskRole = new Role(this, 'fargateTaskRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    taskRole.addToPolicy(taskRoleSsmPolicyStatement);

    jobsQueue.grantConsumeMessages(taskRole);
    jobUpdatesQueue.grantSendMessages(taskRole);

    const executionRoleSsmPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['ssm:GetParameters'],
      resources: ['*'],
    });

    const executionRole = new Role(this, 'fargateExecutionRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    executionRole.addToPolicy(executionRoleSsmPolicy);

    const containerProps: AssetImageProps = {
      file: isEnhanced ? 'Dockerfile.enhanced' : undefined,
      buildArgs: {
        NPM_BASE_64_AUTH: environment.NPM_BASE_64_AUTH,
        NPM_EMAIL: environment.NPM_EMAIL,
      },
    };

    const taskDefLogGroup = new LogGroup(this, 'workerLogGroup');
    const taskDefinition = new FargateTaskDefinition(this, 'workerTaskDefinition', {
      cpu: 2048,
      memoryLimitMiB: 8192,
      taskRole,
      executionRole,
    });

    taskDefinition.addFirelensLogRouter;

    taskDefinition.addContainer('workerImage', {
      image: ContainerImage.fromAsset(path.join(__dirname, '../../../../'), containerProps),
      environment,
      logging: LogDrivers.awsLogs({
        streamPrefix: 'autobuilderworker',
        logGroup: taskDefLogGroup,
      }),
    });

    new FargateService(this, 'fargateService', {
      cluster,
      taskDefinition,
      desiredCount: 5,
      minHealthyPercent: 100,
    });

    this.taskDefinitionArn = taskDefinition.taskDefinitionArn;
    this.ecsTaskRole = taskRole;
  }
}
