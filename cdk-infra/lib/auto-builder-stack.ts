import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AutoBuilderApiConstruct } from './constructs/webhooks-construct';

export class AutoBuilderStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    new AutoBuilderApiConstruct(this, id);
  }
}
