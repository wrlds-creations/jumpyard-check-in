import { Stack, StackProps, Tags, CfnOutput, Duration, RemovalPolicy, ArnFormat } from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as path from 'path';
import { JumpYardCloudConfig } from './config';

interface JumpYardCloudStackProps extends StackProps {
  readonly config: JumpYardCloudConfig;
}

interface HandlerResources {
  readonly api: apigatewayv2.CfnApi;
  readonly rollerCredentialsSecret: secretsmanager.Secret;
  readonly databaseClusterArn: string;
  readonly databaseSecret: secretsmanager.Secret;
  readonly rawPayloadBucket: s3.Bucket;
  readonly rollerOperationsQueue: sqs.Queue;
  readonly eventBus: events.EventBus;
  readonly rollerEnvParameter: ssm.StringParameter;
  readonly rollerBaseUrlParameter: ssm.StringParameter;
  readonly webhookDevTokenSecret: secretsmanager.Secret;
}

export class JumpYardCloudStack extends Stack {
  public constructor(scope: Construct, id: string, props: JumpYardCloudStackProps) {
    super(scope, id, props);

    const { config } = props;
    applyRequiredTags(this, config);

    const vpc = new ec2.CfnVPC(this, 'Vpc', {
      cidrBlock: '10.72.0.0/16',
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: [{ key: 'Name', value: `${config.resourcePrefix}-vpc` }],
    });

    const subnetA = new ec2.CfnSubnet(this, 'IsolatedSubnetA', {
      availabilityZone: `${config.awsRegion}a`,
      cidrBlock: '10.72.0.0/24',
      mapPublicIpOnLaunch: false,
      tags: [{ key: 'Name', value: `${config.resourcePrefix}-isolated-a` }],
      vpcId: vpc.ref,
    });

    const subnetB = new ec2.CfnSubnet(this, 'IsolatedSubnetB', {
      availabilityZone: `${config.awsRegion}b`,
      cidrBlock: '10.72.1.0/24',
      mapPublicIpOnLaunch: false,
      tags: [{ key: 'Name', value: `${config.resourcePrefix}-isolated-b` }],
      vpcId: vpc.ref,
    });

    const databaseSecurityGroup = new ec2.CfnSecurityGroup(this, 'DatabaseSecurityGroup', {
      groupDescription: 'JumpYard Cloud Aurora PostgreSQL access boundary.',
      groupName: `${config.resourcePrefix}-aurora-sg`,
      securityGroupEgress: [
        {
          cidrIp: '127.0.0.1/32',
          ipProtocol: '-1',
        },
      ],
      tags: [{ key: 'Name', value: `${config.resourcePrefix}-aurora-sg` }],
      vpcId: vpc.ref,
    });

    const databaseSubnetGroup = new rds.CfnDBSubnetGroup(this, 'DatabaseSubnetGroup', {
      dbSubnetGroupDescription: 'Isolated subnets for JumpYard Cloud Aurora PostgreSQL.',
      dbSubnetGroupName: `${config.resourcePrefix}-aurora-subnets`,
      subnetIds: [subnetA.ref, subnetB.ref],
    });

    const rollerCredentialsSecret = new secretsmanager.Secret(this, 'RollerCredentialsSecret', {
      secretName: `/${config.resourcePrefix}/roller/credentials`,
      description: 'Roller Playground OAuth credentials for JumpYard Cloud. Values must be set in AWS only.',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ clientId: 'SET_IN_AWS_ONLY' }),
        generateStringKey: 'clientSecret',
        excludePunctuation: true,
      },
    });

    const rollerEnvParameter = new ssm.StringParameter(this, 'RollerEnvParameter', {
      parameterName: `/${config.resourcePrefix}/roller/env`,
      stringValue: config.roller.environment,
      description: 'Roller environment for JumpYard Cloud. Sprint 1 must be playground.',
    });

    const rollerBaseUrlParameter = new ssm.StringParameter(this, 'RollerBaseUrlParameter', {
      parameterName: `/${config.resourcePrefix}/roller/base-url`,
      stringValue: config.roller.baseUrl,
      description: 'Roller Playground API base URL for JumpYard Cloud.',
    });

    const webhookDevTokenSecret = new secretsmanager.Secret(this, 'WebhookDevTokenSecret', {
      secretName: `/${config.resourcePrefix}/webhooks/dev-token`,
      description: 'Development-only shared token for accepting Roller Playground webhooks.',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ purpose: 'roller-playground-webhook' }),
        generateStringKey: 'token',
        excludePunctuation: true,
      },
    });

    const rawPayloadBucket = new s3.Bucket(this, 'RawPayloadBucket', {
      bucketName: `${config.resourcePrefix}-raw-payloads-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      lifecycleRules: [
        {
          enabled: true,
          expiration: Duration.days(30),
          noncurrentVersionExpiration: Duration.days(30),
        },
      ],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const databaseSecret = new secretsmanager.Secret(this, 'DatabaseAdminSecret', {
      secretName: `/${config.resourcePrefix}/aurora/admin`,
      description: 'Generated Aurora PostgreSQL admin credentials for JumpYard Cloud.',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'jumpyard_admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
      },
    });

    const databaseClusterIdentifier = `${config.resourcePrefix}-aurora`;
    const databaseClusterArn = Stack.of(this).formatArn({
      service: 'rds',
      resource: 'cluster',
      resourceName: databaseClusterIdentifier,
      arnFormat: ArnFormat.COLON_RESOURCE_NAME,
    });

    const databaseCluster = new rds.CfnDBCluster(this, 'OperationalDatabase', {
      backupRetentionPeriod: 7,
      copyTagsToSnapshot: true,
      databaseName: 'jumpyard_cloud',
      dbClusterIdentifier: databaseClusterIdentifier,
      dbSubnetGroupName: databaseSubnetGroup.ref,
      deletionProtection: true,
      enableHttpEndpoint: true,
      engine: 'aurora-postgresql',
      engineVersion: '16.13',
      masterUsername: 'jumpyard_admin',
      masterUserPassword: databaseSecret.secretValueFromJson('password').toString(),
      serverlessV2ScalingConfiguration: {
        minCapacity: 0.5,
        maxCapacity: 2,
      },
      storageEncrypted: true,
      vpcSecurityGroupIds: [databaseSecurityGroup.attrGroupId],
    });
    databaseCluster.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const databaseWriter = new rds.CfnDBInstance(this, 'OperationalDatabaseWriter', {
      dbClusterIdentifier: databaseCluster.ref,
      dbInstanceClass: 'db.serverless',
      dbInstanceIdentifier: `${config.resourcePrefix}-aurora-writer`,
      engine: 'aurora-postgresql',
      publiclyAccessible: false,
    });
    databaseWriter.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const deadLetterQueue = new sqs.Queue(this, 'RollerOperationsDeadLetterQueue', {
      queueName: `${config.resourcePrefix}-roller-ops-dlq`,
      enforceSSL: true,
      retentionPeriod: Duration.days(14),
    });

    const rollerOperationsQueue = new sqs.Queue(this, 'RollerOperationsQueue', {
      queueName: `${config.resourcePrefix}-roller-ops`,
      enforceSSL: true,
      visibilityTimeout: Duration.seconds(60),
      retentionPeriod: Duration.days(4),
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: deadLetterQueue,
      },
    });

    const eventBus = new events.EventBus(this, 'EventBus', {
      eventBusName: `${config.resourcePrefix}-events`,
    });

    const api = new apigatewayv2.CfnApi(this, 'HttpApi', {
      name: `${config.resourcePrefix}-api`,
      protocolType: 'HTTP',
      corsConfiguration: {
        allowHeaders: ['content-type', 'x-correlation-id', 'x-idempotency-key'],
        allowMethods: ['OPTIONS', 'POST'],
        allowOrigins: ['*'],
        maxAge: 300,
      },
    });

    new apigatewayv2.CfnStage(this, 'DefaultStage', {
      apiId: api.ref,
      autoDeploy: true,
      stageName: '$default',
    });

    const handlerResources: HandlerResources = {
      api,
      rollerCredentialsSecret,
      databaseClusterArn,
      databaseSecret,
      rawPayloadBucket,
      rollerOperationsQueue,
      eventBus,
      rollerEnvParameter,
      rollerBaseUrlParameter,
      webhookDevTokenSecret,
    };

    const lookupHandler = this.createHandler('LookupHandler', 'lookup', handlerResources, {
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'lookup')),
    });
    const bookingHandler = this.createHandler('BookingHandler', 'booking', handlerResources);
    const redeemHandler = this.createHandler('RedeemHandler', 'redeem', handlerResources);
    const webhookHandler = this.createHandler('WebhookHandler', 'webhook', handlerResources, {
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'webhook')),
    });

    this.addRoute(api, lookupHandler, 'POST /v1/check-in/lookup');
    this.addRoute(api, redeemHandler, 'POST /v1/check-in/redeem');
    this.addRoute(api, bookingHandler, 'POST /v1/bookings/quote');
    this.addRoute(api, bookingHandler, 'POST /v1/bookings/draft');
    this.addRoute(api, bookingHandler, 'POST /v1/bookings/{bookingReference}/add-products/quote');
    this.addRoute(api, bookingHandler, 'POST /v1/bookings/{bookingReference}/add-products');
    this.addRoute(api, webhookHandler, 'POST /v1/roller/webhooks/bookings');
    this.addRoute(api, webhookHandler, 'POST /v1/roller/webhooks/redemptions');

    new CfnOutput(this, 'ApiEndpoint', {
      value: api.attrApiEndpoint,
    });

    new CfnOutput(this, 'RollerCredentialsSecretName', {
      value: rollerCredentialsSecret.secretName,
    });

    new CfnOutput(this, 'RawPayloadBucketName', {
      value: rawPayloadBucket.bucketName,
    });

    new CfnOutput(this, 'OperationalDatabaseClusterArn', {
      value: databaseClusterArn,
    });
  }

  private createHandler(
    id: string,
    handlerName: string,
    resources: HandlerResources,
    options: { readonly code?: lambda.Code } = {},
  ): lambda.Function {
    const functionName = `${this.stackName}-${handlerName}`;

    const logGroup = new logs.LogGroup(this, `${id}LogGroup`, {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const environment: Record<string, string> = {
      JUMPYARD_HANDLER: handlerName,
      ROLLER_CREDENTIALS_SECRET_ARN: resources.rollerCredentialsSecret.secretArn,
      ROLLER_ENV_PARAMETER_NAME: resources.rollerEnvParameter.parameterName,
      ROLLER_BASE_URL_PARAMETER_NAME: resources.rollerBaseUrlParameter.parameterName,
      DATABASE_CLUSTER_ARN: resources.databaseClusterArn,
      DATABASE_SECRET_ARN: resources.databaseSecret.secretArn,
      RAW_PAYLOAD_BUCKET_NAME: resources.rawPayloadBucket.bucketName,
      ROLLER_OPERATIONS_QUEUE_URL: resources.rollerOperationsQueue.queueUrl,
      EVENT_BUS_NAME: resources.eventBus.eventBusName,
    };

    if (handlerName === 'webhook') {
      environment.WEBHOOK_DEV_TOKEN_SECRET_ARN = resources.webhookDevTokenSecret.secretArn;
    }

    const fn = new lambda.Function(this, id, {
      functionName,
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: Duration.seconds(10),
      memorySize: 256,
      code: options.code ?? lambda.Code.fromInline(`
exports.handler = async () => ({
  statusCode: 501,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    status: 'not_implemented',
    handler: process.env.JUMPYARD_HANDLER,
    message: 'T0004 AWS foundation placeholder. No Roller calls are made by this Lambda.'
  })
});
`),
      environment,
    });

    resources.rollerCredentialsSecret.grantRead(fn);
    resources.databaseSecret.grantRead(fn);
    resources.rawPayloadBucket.grantReadWrite(fn);
    resources.rollerOperationsQueue.grantSendMessages(fn);
    resources.eventBus.grantPutEventsTo(fn);
    resources.rollerEnvParameter.grantRead(fn);
    resources.rollerBaseUrlParameter.grantRead(fn);
    if (handlerName === 'webhook') {
      resources.webhookDevTokenSecret.grantRead(fn);
    }

    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'rds-data:BatchExecuteStatement',
          'rds-data:BeginTransaction',
          'rds-data:CommitTransaction',
          'rds-data:ExecuteStatement',
          'rds-data:RollbackTransaction',
        ],
        resources: [resources.databaseClusterArn],
      }),
    );

    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'cloudwatch:namespace': 'JumpYard/Cloud',
          },
        },
      }),
    );

    fn.node.addDependency(logGroup);

    return fn;
  }

  private addRoute(api: apigatewayv2.CfnApi, handler: lambda.Function, routeKey: string): void {
    const logicalId = routeKey
      .replace(/[^A-Za-z0-9]/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');

    const integration = new apigatewayv2.CfnIntegration(this, `${logicalId}Integration`, {
      apiId: api.ref,
      integrationType: 'AWS_PROXY',
      integrationMethod: 'POST',
      integrationUri: handler.functionArn,
      payloadFormatVersion: '2.0',
    });

    new apigatewayv2.CfnRoute(this, `${logicalId}Route`, {
      apiId: api.ref,
      routeKey,
      target: `integrations/${integration.ref}`,
    });

    new lambda.CfnPermission(this, `${logicalId}InvokePermission`, {
      action: 'lambda:InvokeFunction',
      functionName: handler.functionName,
      principal: 'apigateway.amazonaws.com',
      sourceArn: Stack.of(this).formatArn({
        service: 'execute-api',
        resource: api.ref,
        resourceName: '*/*',
        arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      }),
    });
  }
}

function applyRequiredTags(stack: Stack, config: JumpYardCloudConfig): void {
  for (const [key, value] of Object.entries(config.tags)) {
    Tags.of(stack).add(key, value);
  }
}
