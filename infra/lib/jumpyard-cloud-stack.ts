import { Stack, StackProps, Tags, CfnOutput, Duration, RemovalPolicy, ArnFormat } from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
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
import {
  JumpYardCloudConfig,
  PARK_TEST_FRONTEND_REDEEM_REHEARSAL_APPROVAL,
  PARK_TEST_FULL_FLOW_REHEARSAL_APPROVAL,
  PARK_TEST_LINKED_ADD_ON_SETTLEMENT_APPROVAL,
  PARK_TEST_ASSISTED_LOOKUP_APPROVAL,
  PARK_TEST_LIVE_ADD_ON_SMOKE_APPROVAL,
  PARK_TEST_LIVE_LOOKUP_SMOKE_APPROVAL,
  PARK_TEST_LIVE_PAYMENT_SMOKE_APPROVAL,
  PARK_TEST_LIVE_REDEEM_SMOKE_APPROVAL,
  PARK_TEST_POST_PAYMENT_SYNC_APPROVAL,
} from './config';

interface JumpYardCloudStackProps extends StackProps {
  readonly config: JumpYardCloudConfig;
}

interface HandlerResources {
  readonly api: apigatewayv2.CfnApi;
  readonly checkinEmailBaseUrl: string;
  readonly checkinEmailFromAddress: string;
  readonly checkinEmailReplyToAddresses: readonly string[];
  readonly checkinSmsBaseUrl: string;
  readonly rollerCredentialsSecret: secretsmanager.Secret;
  readonly databaseClusterArn: string;
  readonly databaseSecret: secretsmanager.Secret;
  readonly rawPayloadBucket: s3.Bucket;
  readonly rollerOperationsQueue: sqs.Queue;
  readonly eventBus: events.EventBus;
  readonly rollerEnvParameter: ssm.StringParameter;
  readonly rollerBaseUrlParameter: ssm.StringParameter;
  readonly webhookDevTokenSecret: secretsmanager.Secret;
  readonly redeemDevTokenSecret: secretsmanager.Secret;
  readonly staffAuthSecret: secretsmanager.Secret;
  readonly checkinLinkDevTokenSecret: secretsmanager.Secret;
  readonly resourcePrefix: string;
  readonly safetyGates: JumpYardCloudConfig['safetyGates'];
  readonly wrldsEnvironment: string;
}

interface ObservabilityResources {
  readonly api: apigatewayv2.CfnApi;
  readonly apiAccessLogGroup: logs.LogGroup;
  readonly bookingHandler: lambda.Function;
  readonly dataSyncHandler: lambda.Function;
  readonly deadLetterQueue: sqs.Queue;
  readonly lookupHandler: lambda.Function;
  readonly redeemHandler: lambda.Function;
  readonly rollerOperationsQueue: sqs.Queue;
  readonly sessionHandler: lambda.Function;
  readonly webhookHandler: lambda.Function;
}

type ApiRouteHandler = 'booking' | 'lookup' | 'redeem' | 'session' | 'webhook';
type ApiRouteAuthorizationType = 'AWS_IAM' | 'NONE';
type ApiRouteTrustClass =
  | 'guest_public'
  | 'guest_token'
  | 'guest_write'
  | 'internal_ops'
  | 'legacy_dev_only'
  | 'roller_webhook'
  | 'staff_auth_entry'
  | 'staff_protected';

interface ApiRouteProtection {
  readonly authorizationType: ApiRouteAuthorizationType;
  readonly handler: ApiRouteHandler;
  readonly routeKey: string;
  readonly throttlingBurstLimit: number;
  readonly throttlingRateLimit: number;
  readonly trustClass: ApiRouteTrustClass;
}

// HTTP API throttles are aggregate route-level capacity controls, not per-IP identity limits.
// These envelopes preserve a 30-40 guest/two-minute shared-Wi-Fi arrival wave while isolating
// sensitive writes, staff login, internal operations, and Roller webhooks into separate buckets.
const API_ROUTE_PROTECTION_CATALOG = [
  {
    authorizationType: 'NONE',
    handler: 'lookup',
    routeKey: 'POST /v1/check-in/lookup',
    throttlingBurstLimit: 80,
    throttlingRateLimit: 25,
    trustClass: 'guest_public',
  },
  {
    authorizationType: 'NONE',
    handler: 'session',
    routeKey: 'POST /v1/staff/auth/login',
    throttlingBurstLimit: 10,
    throttlingRateLimit: 2,
    trustClass: 'staff_auth_entry',
  },
  {
    authorizationType: 'AWS_IAM',
    handler: 'session',
    routeKey: 'POST /v1/check-in/session-links',
    throttlingBurstLimit: 5,
    throttlingRateLimit: 1,
    trustClass: 'internal_ops',
  },
  {
    authorizationType: 'AWS_IAM',
    handler: 'session',
    routeKey: 'POST /v1/check-in/session-links/send-sms',
    throttlingBurstLimit: 5,
    throttlingRateLimit: 1,
    trustClass: 'internal_ops',
  },
  {
    authorizationType: 'AWS_IAM',
    handler: 'session',
    routeKey: 'POST /v1/check-in/session-links/send-email',
    throttlingBurstLimit: 5,
    throttlingRateLimit: 1,
    trustClass: 'internal_ops',
  },
  {
    authorizationType: 'AWS_IAM',
    handler: 'session',
    routeKey: 'POST /v1/check-in/session-links/send-due-sms',
    throttlingBurstLimit: 5,
    throttlingRateLimit: 1,
    trustClass: 'internal_ops',
  },
  {
    authorizationType: 'AWS_IAM',
    handler: 'session',
    routeKey: 'POST /v1/check-in/session-links/send-due-messages',
    throttlingBurstLimit: 5,
    throttlingRateLimit: 1,
    trustClass: 'internal_ops',
  },
  {
    authorizationType: 'NONE',
    handler: 'session',
    routeKey: 'POST /v1/check-in/session-links/resolve',
    throttlingBurstLimit: 100,
    throttlingRateLimit: 40,
    trustClass: 'guest_token',
  },
  {
    authorizationType: 'NONE',
    handler: 'session',
    routeKey: 'POST /v1/check-in/sessions',
    throttlingBurstLimit: 100,
    throttlingRateLimit: 40,
    trustClass: 'guest_token',
  },
  {
    authorizationType: 'NONE',
    handler: 'session',
    routeKey: 'POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff',
    throttlingBurstLimit: 100,
    throttlingRateLimit: 40,
    trustClass: 'guest_token',
  },
  {
    authorizationType: 'NONE',
    handler: 'session',
    routeKey: 'GET /v1/staff/check-in/sessions',
    throttlingBurstLimit: 50,
    throttlingRateLimit: 20,
    trustClass: 'staff_protected',
  },
  {
    authorizationType: 'NONE',
    handler: 'session',
    routeKey: 'GET /v1/staff/check-in/sessions/{checkinSessionId}',
    throttlingBurstLimit: 50,
    throttlingRateLimit: 20,
    trustClass: 'staff_protected',
  },
  {
    authorizationType: 'AWS_IAM',
    handler: 'redeem',
    routeKey: 'POST /v1/check-in/redeem',
    throttlingBurstLimit: 5,
    throttlingRateLimit: 1,
    trustClass: 'legacy_dev_only',
  },
  {
    authorizationType: 'NONE',
    handler: 'redeem',
    routeKey: 'POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem',
    throttlingBurstLimit: 20,
    throttlingRateLimit: 5,
    trustClass: 'staff_protected',
  },
  {
    authorizationType: 'NONE',
    handler: 'booking',
    routeKey: 'POST /v1/bookings/quote',
    throttlingBurstLimit: 40,
    throttlingRateLimit: 10,
    trustClass: 'guest_public',
  },
  {
    authorizationType: 'NONE',
    handler: 'booking',
    routeKey: 'POST /v1/bookings/draft',
    throttlingBurstLimit: 20,
    throttlingRateLimit: 5,
    trustClass: 'guest_write',
  },
  {
    authorizationType: 'NONE',
    handler: 'booking',
    routeKey: 'POST /v1/bookings/availability',
    throttlingBurstLimit: 60,
    throttlingRateLimit: 20,
    trustClass: 'guest_public',
  },
  {
    authorizationType: 'NONE',
    handler: 'booking',
    routeKey: 'POST /v1/bookings/{bookingReference}/add-products/quote',
    throttlingBurstLimit: 40,
    throttlingRateLimit: 10,
    trustClass: 'guest_token',
  },
  {
    authorizationType: 'NONE',
    handler: 'booking',
    routeKey: 'POST /v1/bookings/{bookingReference}/add-products',
    throttlingBurstLimit: 20,
    throttlingRateLimit: 5,
    trustClass: 'guest_write',
  },
  {
    authorizationType: 'NONE',
    handler: 'webhook',
    routeKey: 'POST /v1/roller/webhooks/bookings',
    throttlingBurstLimit: 50,
    throttlingRateLimit: 10,
    trustClass: 'roller_webhook',
  },
  {
    authorizationType: 'NONE',
    handler: 'webhook',
    routeKey: 'POST /v1/roller/webhooks/redemptions',
    throttlingBurstLimit: 50,
    throttlingRateLimit: 10,
    trustClass: 'roller_webhook',
  },
] as const satisfies readonly ApiRouteProtection[];

function buildApiRouteSettings(): Record<
  string,
  { readonly DetailedMetricsEnabled: boolean; readonly ThrottlingBurstLimit: number; readonly ThrottlingRateLimit: number }
> {
  return Object.fromEntries(
    API_ROUTE_PROTECTION_CATALOG.map((route) => [
      route.routeKey,
      {
        DetailedMetricsEnabled: true,
        ThrottlingBurstLimit: route.throttlingBurstLimit,
        ThrottlingRateLimit: route.throttlingRateLimit,
      },
    ]),
  );
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

    const redeemDevTokenSecret = new secretsmanager.Secret(this, 'RedeemDevTokenSecret', {
      secretName: `/${config.resourcePrefix}/redeem/dev-token`,
      description: 'Development-only shared token for confirmed Roller Playground ticket redemption.',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ purpose: 'roller-playground-redeem' }),
        generateStringKey: 'token',
        excludePunctuation: true,
      },
    });

    const staffAuthSecret = new secretsmanager.Secret(this, 'StaffAuthSecret', {
      secretName: `/${config.resourcePrefix}/staff/auth`,
      description: 'Pilot staff passcode used to issue short-lived JumpYard Cloud staff tokens.',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ displayName: 'JumpYard Staff', tokenTtlMinutes: 720 }),
        generateStringKey: 'passcode',
        excludePunctuation: true,
      },
    });

    const checkinLinkDevTokenSecret = new secretsmanager.Secret(this, 'CheckinLinkDevTokenSecret', {
      secretName: `/${config.resourcePrefix}/checkin-links/dev-token`,
      description: 'Development-only shared token for creating JumpYard Cloud check-in session links.',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ purpose: 'checkin-session-link-create' }),
        generateStringKey: 'token',
        excludePunctuation: true,
      },
    });

    const rawPayloadBucket = new s3.Bucket(this, 'RawPayloadBucket', {
      bucketName: buildRawPayloadBucketName(config.resourcePrefix, this.account, this.region),
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

    // SNS SMS attributes are account-wide, so keep delivery-status ownership on dev until park-test messaging is scoped.
    if (config.tags['WRLDS:Environment'] === 'dev') {
      this.configureSmsDeliveryStatusLogging(config);
    }

    const api = new apigatewayv2.CfnApi(this, 'HttpApi', {
      name: `${config.resourcePrefix}-api`,
      protocolType: 'HTTP',
      corsConfiguration: {
        allowHeaders: [
          'authorization',
          'content-type',
          'x-correlation-id',
          'x-idempotency-key',
          'x-jumpyard-link-token',
          'x-jumpyard-redeem-token',
          'x-jumpyard-staff-token',
        ],
        allowMethods: ['GET', 'OPTIONS', 'POST'],
        allowOrigins: [...config.api.allowedCorsOrigins],
        maxAge: 300,
      },
    });

    const apiAccessLogGroup = new logs.LogGroup(this, 'HttpApiAccessLogGroup', {
      logGroupName: `/aws/apigateway/${config.resourcePrefix}-api-access`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const defaultStage = new apigatewayv2.CfnStage(this, 'DefaultStage', {
      apiId: api.ref,
      accessLogSettings: {
        destinationArn: apiAccessLogGroup.logGroupArn,
        format: JSON.stringify({
          requestId: '$context.requestId',
          routeKey: '$context.routeKey',
          status: '$context.status',
          integrationStatus: '$context.integrationStatus',
          responseLatency: '$context.responseLatency',
          integrationLatency: '$context.integrationLatency',
          error: '$context.error.message',
        }),
      },
      autoDeploy: true,
      defaultRouteSettings: {
        detailedMetricsEnabled: true,
        throttlingBurstLimit: config.api.throttlingBurstLimit,
        throttlingRateLimit: config.api.throttlingRateLimit,
      },
      routeSettings: buildApiRouteSettings(),
      stageName: '$default',
    });

    const handlerResources: HandlerResources = {
      api,
      checkinEmailBaseUrl: config.guestEmail.checkinBaseUrl,
      checkinEmailFromAddress: config.guestEmail.fromAddress,
      checkinEmailReplyToAddresses: config.guestEmail.replyToAddresses,
      checkinSmsBaseUrl: config.bookingTimeSms.checkinBaseUrl,
      rollerCredentialsSecret,
      databaseClusterArn,
      databaseSecret,
      rawPayloadBucket,
      rollerOperationsQueue,
      eventBus,
      rollerEnvParameter,
      rollerBaseUrlParameter,
      webhookDevTokenSecret,
      redeemDevTokenSecret,
      staffAuthSecret,
      checkinLinkDevTokenSecret,
      resourcePrefix: config.resourcePrefix,
      safetyGates: config.safetyGates,
      wrldsEnvironment: config.tags['WRLDS:Environment'],
    };

    const lookupHandler = this.createHandler('LookupHandler', 'lookup', handlerResources, {
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'lookup')),
    });
    const bookingHandler = this.createHandler('BookingHandler', 'booking', handlerResources, {
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'booking')),
    });
    const redeemHandler = this.createHandler('RedeemHandler', 'redeem', handlerResources, {
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'redeem')),
    });
    const sessionHandler = this.createHandler('SessionHandler', 'session', handlerResources, {
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'session')),
    });
    const webhookHandler = this.createHandler('WebhookHandler', 'webhook', handlerResources, {
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'webhook')),
    });
    const dataSyncHandler = this.createHandler('DataSyncHandler', 'data-sync', handlerResources, {
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'data-sync')),
      grantOperationalWriters: false,
      memorySize: 512,
      timeout: Duration.minutes(10),
    });

    new events.Rule(this, 'DailyDataApiSyncRule', {
      ruleName: `${config.resourcePrefix}-data-api-daily-sync`,
      description:
        'Runs the Playground Roller Data API modified-date sync for the previous UTC day. Roller writes are not performed.',
      enabled: config.roller.environment === 'playground',
      schedule: events.Schedule.cron({ minute: '0', hour: '2' }),
      targets: [
        new targets.LambdaFunction(dataSyncHandler, {
          event: events.RuleTargetInput.fromObject({
            source: 'eventbridge.daily',
          }),
          retryAttempts: 2,
        }),
      ],
    });

    if (config.bookingTimeSms.scheduleEnabled) {
      new events.Rule(this, 'BookingTimeSmsScheduleRule', {
        ruleName: `${config.resourcePrefix}-booking-time-sms-schedule`,
        description:
          'Runs the dev booking-time guest messaging trigger on a fixed cadence. Real sends require config confirmation and a public HTTPS check-in URL.',
        schedule: events.Schedule.rate(Duration.minutes(config.bookingTimeSms.rateMinutes)),
        targets: [
          new targets.LambdaFunction(sessionHandler, {
            event: events.RuleTargetInput.fromObject({
              source: 'jumpyard.booking-time-messaging-scheduler',
              detail: {
                baseUrl: config.bookingTimeSms.checkinBaseUrl,
                channels: ['sms', 'email'],
                confirmSend: config.bookingTimeSms.confirmSend,
                confirmedSendApproval: config.bookingTimeSms.confirmedSendApproval,
                emailBaseUrl: config.guestEmail.checkinBaseUrl,
                leadMinutes: config.bookingTimeSms.leadMinutes,
                limit: config.bookingTimeSms.limit,
                smsBaseUrl: config.bookingTimeSms.checkinBaseUrl,
                trigger: 'scheduled_booking_time_messaging',
                windowMinutes: config.bookingTimeSms.windowMinutes,
              },
            }),
            retryAttempts: 2,
          }),
        ],
      });
    }

    const apiHandlers: Record<ApiRouteHandler, lambda.Function> = {
      booking: bookingHandler,
      lookup: lookupHandler,
      redeem: redeemHandler,
      session: sessionHandler,
      webhook: webhookHandler,
    };

    for (const protection of API_ROUTE_PROTECTION_CATALOG) {
      const route = this.addRoute(api, apiHandlers[protection.handler], protection);
      defaultStage.addDependency(route);
    }

    this.addOperationalObservability(config, {
      api,
      apiAccessLogGroup,
      bookingHandler,
      dataSyncHandler,
      deadLetterQueue,
      lookupHandler,
      redeemHandler,
      rollerOperationsQueue,
      sessionHandler,
      webhookHandler,
    });

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

  private addOperationalObservability(config: JumpYardCloudConfig, resources: ObservabilityResources): void {
    const period = Duration.minutes(5);
    const lambdaHandlers = [
      { id: 'Lookup', name: 'lookup', fn: resources.lookupHandler },
      { id: 'Booking', name: 'booking', fn: resources.bookingHandler },
      { id: 'Redeem', name: 'redeem', fn: resources.redeemHandler },
      { id: 'Session', name: 'session', fn: resources.sessionHandler },
      { id: 'Webhook', name: 'webhook', fn: resources.webhookHandler },
      { id: 'DataSync', name: 'data-sync', fn: resources.dataSyncHandler },
    ];

    const apiMetric = (metricName: string, statistic: string) =>
      new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName,
        dimensionsMap: {
          ApiId: resources.api.ref,
          Stage: '$default',
        },
        statistic,
        period,
      });

    const rollerApiCalls = new cloudwatch.Metric({
      namespace: 'JumpYard/Cloud',
      metricName: 'RollerApiCallCount',
      dimensionsMap: {
        Environment: config.resourcePrefix,
      },
      statistic: 'Sum',
      period,
    });

    const rollerApiErrors = new cloudwatch.Metric({
      namespace: 'JumpYard/Cloud',
      metricName: 'RollerApiErrorCount',
      dimensionsMap: {
        Environment: config.resourcePrefix,
      },
      statistic: 'Sum',
      period,
    });

    const throttledRequestMetric = new cloudwatch.Metric({
      namespace: 'JumpYard/Cloud',
      metricName: 'ApiThrottledRequestCount',
      statistic: 'Sum',
      period,
    });

    new logs.MetricFilter(this, 'ApiThrottledRequestMetricFilter', {
      logGroup: resources.apiAccessLogGroup,
      filterPattern: logs.FilterPattern.stringValue('$.status', '=', '429'),
      metricNamespace: 'JumpYard/Cloud',
      metricName: 'ApiThrottledRequestCount',
      metricValue: '1',
    });

    const dashboard = new cloudwatch.Dashboard(this, 'OperationsDashboard', {
      dashboardName: `${config.resourcePrefix}-ops`,
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API requests and errors',
        left: [
          apiMetric('Count', 'Sum').with({ label: 'requests' }),
          apiMetric('4xx', 'Sum').with({ label: '4xx' }),
          apiMetric('5xx', 'Sum').with({ label: '5xx' }),
          throttledRequestMetric.with({ label: '429 throttled' }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'API latency p95',
        left: [
          apiMetric('Latency', 'p95').with({ label: 'latency' }),
          apiMetric('IntegrationLatency', 'p95').with({ label: 'integration latency' }),
        ],
        width: 12,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda invocations',
        left: lambdaHandlers.map((handler) =>
          handler.fn.metricInvocations({ statistic: 'Sum', period }).with({ label: handler.name }),
        ),
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda errors and throttles',
        left: lambdaHandlers.map((handler) =>
          handler.fn.metricErrors({ statistic: 'Sum', period }).with({ label: `${handler.name} errors` }),
        ),
        right: lambdaHandlers.map((handler) =>
          handler.fn.metricThrottles({ statistic: 'Sum', period }).with({ label: `${handler.name} throttles` }),
        ),
        width: 12,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda duration p95',
        left: lambdaHandlers.map((handler) =>
          handler.fn.metricDuration({ statistic: 'p95', period }).with({ label: handler.name }),
        ),
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Queues',
        left: [
          resources.rollerOperationsQueue
            .metricApproximateNumberOfMessagesVisible({ statistic: 'Maximum', period })
            .with({ label: 'roller ops visible' }),
          resources.deadLetterQueue
            .metricApproximateNumberOfMessagesVisible({ statistic: 'Maximum', period })
            .with({ label: 'dlq visible' }),
        ],
        width: 12,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Roller outbound API calls',
        left: [rollerApiCalls.with({ label: 'calls' })],
        right: [rollerApiErrors.with({ label: 'errors' })],
        width: 12,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Last 5 minutes',
        metrics: [
          apiMetric('Count', 'Sum').with({ label: 'API requests' }),
          throttledRequestMetric.with({ label: 'API throttles' }),
          rollerApiCalls.with({ label: 'Roller calls' }),
          rollerApiErrors.with({ label: 'Roller errors' }),
        ],
        width: 12,
      }),
    );

    new cloudwatch.Alarm(this, 'Api5xxAlarm', {
      alarmName: `${config.resourcePrefix}-api-5xx`,
      metric: apiMetric('5xx', 'Sum'),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'ApiHigh4xxAlarm', {
      alarmName: `${config.resourcePrefix}-api-high-4xx`,
      metric: apiMetric('4xx', 'Sum'),
      threshold: 25,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'ApiThrottledRequestsAlarm', {
      alarmName: `${config.resourcePrefix}-api-throttled-requests`,
      metric: throttledRequestMetric,
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'RollerApiErrorsAlarm', {
      alarmName: `${config.resourcePrefix}-roller-api-errors`,
      metric: rollerApiErrors,
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'RollerOpsDlqVisibleAlarm', {
      alarmName: `${config.resourcePrefix}-roller-ops-dlq-visible`,
      metric: resources.deadLetterQueue.metricApproximateNumberOfMessagesVisible({ statistic: 'Maximum', period }),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    for (const handler of lambdaHandlers) {
      new cloudwatch.Alarm(this, `${handler.id}ErrorsAlarm`, {
        alarmName: `${config.resourcePrefix}-${handler.name}-lambda-errors`,
        metric: handler.fn.metricErrors({ statistic: 'Sum', period }),
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      new cloudwatch.Alarm(this, `${handler.id}ThrottlesAlarm`, {
        alarmName: `${config.resourcePrefix}-${handler.name}-lambda-throttles`,
        metric: handler.fn.metricThrottles({ statistic: 'Sum', period }),
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    }
  }

  private configureSmsDeliveryStatusLogging(config: JumpYardCloudConfig): void {
    const smsDeliveryStatusRole = new iam.Role(this, 'SmsDeliveryStatusRole', {
      roleName: `${config.resourcePrefix}-sns-sms-delivery-status`,
      assumedBy: new iam.ServicePrincipal('sns.amazonaws.com'),
      description: 'Allows Amazon SNS to write SMS delivery status logs for JumpYard Cloud dev diagnostics.',
    });

    smsDeliveryStatusRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'logs:PutMetricFilter',
          'logs:PutMetricData',
        ],
        resources: ['*'],
      }),
    );

    const attributes = {
      DefaultSMSType: 'Transactional',
      DeliveryStatusIAMRole: smsDeliveryStatusRole.roleArn,
      DeliveryStatusSuccessSamplingRate: '100',
    };

    const smsDeliveryStatusAttributes = new cr.AwsCustomResource(this, 'SmsDeliveryStatusAttributes', {
      onCreate: {
        service: 'SNS',
        action: 'setSMSAttributes',
        parameters: { attributes },
        physicalResourceId: cr.PhysicalResourceId.of(`${config.resourcePrefix}-sns-sms-delivery-status-v1`),
      },
      onUpdate: {
        service: 'SNS',
        action: 'setSMSAttributes',
        parameters: { attributes },
        physicalResourceId: cr.PhysicalResourceId.of(`${config.resourcePrefix}-sns-sms-delivery-status-v1`),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['sns:SetSMSAttributes'],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: ['iam:PassRole'],
          resources: [smsDeliveryStatusRole.roleArn],
        }),
      ]),
      installLatestAwsSdk: false,
      timeout: Duration.minutes(2),
    });

    smsDeliveryStatusAttributes.node.addDependency(smsDeliveryStatusRole);
  }

  private createHandler(
    id: string,
    handlerName: string,
    resources: HandlerResources,
    options: {
      readonly code?: lambda.Code;
      readonly grantOperationalWriters?: boolean;
      readonly memorySize?: number;
      readonly timeout?: Duration;
    } = {},
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
      RESOURCE_PREFIX: resources.resourcePrefix,
      JUMPYARD_EMERGENCY_STOP: String(resources.safetyGates.emergencyStop),
      JUMPYARD_ENVIRONMENT: resources.wrldsEnvironment,
    };

    if (handlerName === 'data-sync') {
      environment.RESOURCE_PREFIX = resources.resourcePrefix;
    }

    if (handlerName === 'webhook') {
      environment.ENABLE_ROLLER_WEBHOOK_PROCESSING = String(resources.safetyGates.rollerWebhookProcessingEnabled);
      environment.WEBHOOK_DEV_TOKEN_SECRET_ARN = resources.webhookDevTokenSecret.secretArn;
    }

    if (handlerName === 'session') {
      const fullFlowRehearsalEnabled =
        resources.safetyGates.fullFlowRehearsalApproval === PARK_TEST_FULL_FLOW_REHEARSAL_APPROVAL;
      environment.CHECKIN_EMAIL_BASE_URL = resources.checkinEmailBaseUrl;
      environment.CHECKIN_SMS_BASE_URL = resources.checkinSmsBaseUrl;
      environment.CHECKIN_LINK_DEV_TOKEN_SECRET_ARN = resources.checkinLinkDevTokenSecret.secretArn;
      environment.EMAIL_FROM_ADDRESS = resources.checkinEmailFromAddress;
      environment.EMAIL_PROVIDER = 'aws_ses';
      environment.EMAIL_REPLY_TO_ADDRESSES = resources.checkinEmailReplyToAddresses.join(',');
      environment.ENABLE_GUEST_MESSAGE_SENDS = String(resources.safetyGates.guestMessagingSendsEnabled);
      environment.ENABLE_STAFF_AUTH = String(resources.safetyGates.staffAuthEnabled);
      environment.ENABLE_T0166_LIVE_REDEEM_SMOKE = String(
        resources.safetyGates.liveRedeemSmokeApproval === PARK_TEST_LIVE_REDEEM_SMOKE_APPROVAL,
      );
      environment.T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS =
        resources.safetyGates.liveRedeemSmokeAllowedIdentifiers.join(',');
      environment.ENABLE_T0176_FRONTEND_REDEEM_REHEARSAL = String(
        resources.safetyGates.frontendRedeemRehearsalApproval === PARK_TEST_FRONTEND_REDEEM_REHEARSAL_APPROVAL,
      );
      environment.T0176_FRONTEND_REDEEM_REHEARSAL_ALLOWED_SESSION_IDS =
        resources.safetyGates.frontendRedeemRehearsalAllowedSessionIds.join(',');
      environment.ENABLE_T0176_FULL_FLOW_REHEARSAL = String(fullFlowRehearsalEnabled);
      environment.SMS_PROVIDER = 'aws_sns';
      environment.SMS_SENDER_ID = 'JumpYard';
      environment.STAFF_AUTH_SECRET_ARN = resources.staffAuthSecret.secretArn;
    }

    if (handlerName === 'booking') {
      const fullFlowRehearsalEnabled =
        resources.safetyGates.fullFlowRehearsalApproval === PARK_TEST_FULL_FLOW_REHEARSAL_APPROVAL;
      environment.ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES = String(
        resources.safetyGates.livePaymentSmokeApproval === PARK_TEST_LIVE_PAYMENT_SMOKE_APPROVAL ||
          fullFlowRehearsalEnabled,
      );
      environment.ENABLE_T0162_LIVE_ADDON_SMOKE = String(
        resources.safetyGates.liveAddOnSmokeApproval === PARK_TEST_LIVE_ADD_ON_SMOKE_APPROVAL ||
          fullFlowRehearsalEnabled,
      );
      environment.T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS =
        resources.safetyGates.liveAddOnSmokeAllowedIdentifiers.join(',');
      environment.ENABLE_T0176_FULL_FLOW_REHEARSAL = String(fullFlowRehearsalEnabled);
      environment.T0176_FULL_FLOW_ALLOWED_OPERATING_DATES =
        resources.safetyGates.fullFlowRehearsalAllowedOperatingDates.join(',');
      environment.T0176_FULL_FLOW_VENUE_ID =
        resources.safetyGates.fullFlowRehearsalVenueId ?? '';
      environment.ENABLE_ROLLER_BOOKING_DRAFT_WRITES = String(
        resources.safetyGates.rollerBookingDraftWritesEnabled,
      );
    }

    if (handlerName === 'lookup') {
      const fullFlowRehearsalEnabled =
        resources.safetyGates.fullFlowRehearsalApproval === PARK_TEST_FULL_FLOW_REHEARSAL_APPROVAL;
      environment.ENABLE_T0165_LINKED_ADDON_SETTLEMENT = String(
        resources.safetyGates.liveLinkedAddOnSettlementApproval === PARK_TEST_LINKED_ADD_ON_SETTLEMENT_APPROVAL,
      );
      environment.T0165_LINKED_ADDON_SETTLEMENT_ALLOWED_IDENTIFIERS =
        resources.safetyGates.liveLinkedAddOnSettlementAllowedIdentifiers.join(',');
      environment.ENABLE_T0160_LIVE_LOOKUP_SMOKE = String(
        resources.safetyGates.liveLookupSmokeApproval === PARK_TEST_LIVE_LOOKUP_SMOKE_APPROVAL,
      );
      environment.T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS =
        resources.safetyGates.liveLookupSmokeAllowedIdentifiers.join(',');
      environment.ENABLE_T0169_POST_PAYMENT_SYNC = String(
        resources.safetyGates.livePostPaymentSyncApproval === PARK_TEST_POST_PAYMENT_SYNC_APPROVAL ||
          fullFlowRehearsalEnabled,
      );
      environment.ENABLE_T0171_ASSISTED_LOOKUP = String(
        resources.safetyGates.liveAssistedLookupApproval === PARK_TEST_ASSISTED_LOOKUP_APPROVAL ||
          fullFlowRehearsalEnabled,
      );
      environment.T0171_ASSISTED_LOOKUP_ALLOWED_OPERATING_DATES =
        (fullFlowRehearsalEnabled
          ? resources.safetyGates.fullFlowRehearsalAllowedOperatingDates
          : resources.safetyGates.liveAssistedLookupAllowedOperatingDates
        ).join(',');
      environment.T0171_ASSISTED_LOOKUP_VENUE_ID =
        (fullFlowRehearsalEnabled
          ? resources.safetyGates.fullFlowRehearsalVenueId
          : resources.safetyGates.liveAssistedLookupVenueId) ?? '';
    }

    if (handlerName === 'redeem') {
      const fullFlowRehearsalEnabled =
        resources.safetyGates.fullFlowRehearsalApproval === PARK_TEST_FULL_FLOW_REHEARSAL_APPROVAL;
      environment.ENABLE_ROLLER_REDEEM_WRITES = String(resources.safetyGates.rollerRedeemWritesEnabled);
      environment.ENABLE_T0166_LIVE_REDEEM_SMOKE = String(
        resources.safetyGates.liveRedeemSmokeApproval === PARK_TEST_LIVE_REDEEM_SMOKE_APPROVAL,
      );
      environment.ENABLE_T0176_FULL_FLOW_REHEARSAL = String(fullFlowRehearsalEnabled);
      environment.T0176_FULL_FLOW_ALLOWED_OPERATING_DATES =
        resources.safetyGates.fullFlowRehearsalAllowedOperatingDates.join(',');
      environment.T0176_FULL_FLOW_VENUE_ID =
        resources.safetyGates.fullFlowRehearsalVenueId ?? '';
      environment.REDEEM_DEV_TOKEN_SECRET_ARN = resources.redeemDevTokenSecret.secretArn;
      environment.STAFF_AUTH_SECRET_ARN = resources.staffAuthSecret.secretArn;
      environment.T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS =
        resources.safetyGates.liveRedeemSmokeAllowedIdentifiers.join(',');
    }

    const fn = new lambda.Function(this, id, {
      functionName,
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: options.timeout ?? Duration.seconds(10),
      memorySize: options.memorySize ?? 256,
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

    if (handlerName !== 'session') {
      resources.rollerCredentialsSecret.grantRead(fn);
    }
    resources.databaseSecret.grantRead(fn);
    if (options.grantOperationalWriters ?? handlerName !== 'session') {
      resources.rawPayloadBucket.grantReadWrite(fn);
      resources.rollerOperationsQueue.grantSendMessages(fn);
      resources.eventBus.grantPutEventsTo(fn);
    }
    if (handlerName !== 'session') {
      resources.rollerEnvParameter.grantRead(fn);
      resources.rollerBaseUrlParameter.grantRead(fn);
    }
    if (handlerName === 'webhook') {
      resources.webhookDevTokenSecret.grantRead(fn);
    }
    if (handlerName === 'redeem') {
      resources.redeemDevTokenSecret.grantRead(fn);
    }
    if (handlerName === 'session') {
      resources.checkinLinkDevTokenSecret.grantRead(fn);
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['sns:Publish'],
          resources: ['*'],
        }),
      );
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['ses:SendEmail'],
          resources: ['*'],
        }),
      );
    }
    if (handlerName === 'session' || handlerName === 'redeem') {
      resources.staffAuthSecret.grantRead(fn);
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

  private addRoute(
    api: apigatewayv2.CfnApi,
    handler: lambda.Function,
    protection: ApiRouteProtection,
  ): apigatewayv2.CfnRoute {
    const logicalId = protection.routeKey
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

    const route = new apigatewayv2.CfnRoute(this, `${logicalId}Route`, {
      apiId: api.ref,
      authorizationType: protection.authorizationType,
      routeKey: protection.routeKey,
      target: `integrations/${integration.ref}`,
    });
    route.addMetadata('JumpYardHandler', protection.handler);
    route.addMetadata('JumpYardTrustClass', protection.trustClass);

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

    return route;
  }
}

function applyRequiredTags(stack: Stack, config: JumpYardCloudConfig): void {
  for (const [key, value] of Object.entries(config.tags)) {
    Tags.of(stack).add(key, value);
  }
}

function buildRawPayloadBucketName(resourcePrefix: string, account: string, region: string): string {
  const standardName = `${resourcePrefix}-raw-payloads-${account}-${region}`;
  if (standardName.length <= 63) {
    return standardName;
  }

  const compactName = `${resourcePrefix}-raw-${account}-${region}`;
  if (compactName.length <= 63) {
    return compactName;
  }

  throw new Error(`Raw payload bucket name is too long for resource prefix ${resourcePrefix}.`);
}
