import { Construct } from 'constructs';
import { AutoBuilderApiConstruct } from './api/api-construct';
import { AutoBuilderEnvConstruct } from './api/env-construct';
import { AutoBuilderQueuesConstruct } from './queue/queues-construct';

export class AutoBuilderConstruct extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const queues = new AutoBuilderQueuesConstruct(this, 'queues');
    const { environment } = new AutoBuilderEnvConstruct(this, 'ssmVars', queues);

    new AutoBuilderApiConstruct(this, 'api', { ...queues, environment });
  }
}
