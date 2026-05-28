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
import { JumpYardCloudConfig } from './config';

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

    this.configureSmsDeliveryStatusLogging(config);

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

    new apigatewayv2.CfnStage(this, 'DefaultStage', {
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
        'Runs the dev Roller Data API modified-date sync for the previous UTC day. Roller writes are not performed.',
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
          'Runs the dev booking-time SMS trigger on a fixed cadence. Real sends require config confirmation and a public HTTPS check-in URL.',
        schedule: events.Schedule.rate(Duration.minutes(config.bookingTimeSms.rateMinutes)),
        targets: [
          new targets.LambdaFunction(sessionHandler, {
            event: events.RuleTargetInput.fromObject({
              source: 'jumpyard.booking-time-sms-scheduler',
              detail: {
                baseUrl: config.bookingTimeSms.checkinBaseUrl,
                confirmSend: config.bookingTimeSms.confirmSend,
                confirmedSendApproval: config.bookingTimeSms.confirmedSendApproval,
                leadMinutes: config.bookingTimeSms.leadMinutes,
                limit: config.bookingTimeSms.limit,
                trigger: 'scheduled_booking_time_sms',
                windowMinutes: config.bookingTimeSms.windowMinutes,
              },
            }),
            retryAttempts: 2,
          }),
        ],
      });
    }

    this.addRoute(api, lookupHandler, 'POST /v1/check-in/lookup');
    this.addRoute(api, sessionHandler, 'POST /v1/staff/auth/login');
    this.addRoute(api, sessionHandler, 'POST /v1/check-in/session-links');
    this.addRoute(api, sessionHandler, 'POST /v1/check-in/session-links/send-sms');
    this.addRoute(api, sessionHandler, 'POST /v1/check-in/session-links/send-email');
    this.addRoute(api, sessionHandler, 'POST /v1/check-in/session-links/send-due-sms');
    this.addRoute(api, sessionHandler, 'POST /v1/check-in/session-links/resolve');
    this.addRoute(api, sessionHandler, 'POST /v1/check-in/sessions');
    this.addRoute(api, sessionHandler, 'POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff');
    this.addRoute(api, sessionHandler, 'GET /v1/staff/check-in/sessions');
    this.addRoute(api, sessionHandler, 'GET /v1/staff/check-in/sessions/{checkinSessionId}');
    this.addRoute(api, redeemHandler, 'POST /v1/check-in/redeem');
    this.addRoute(api, redeemHandler, 'POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem');
    this.addRoute(api, bookingHandler, 'POST /v1/bookings/quote');
    this.addRoute(api, bookingHandler, 'POST /v1/bookings/draft');
    this.addRoute(api, bookingHandler, 'POST /v1/bookings/availability');
    this.addRoute(api, bookingHandler, 'POST /v1/bookings/{bookingReference}/add-products/quote');
    this.addRoute(api, bookingHandler, 'POST /v1/bookings/{bookingReference}/add-products');
    this.addRoute(api, webhookHandler, 'POST /v1/roller/webhooks/bookings');
    this.addRoute(api, webhookHandler, 'POST /v1/roller/webhooks/redemptions');

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
    };

    if (handlerName === 'data-sync') {
      environment.RESOURCE_PREFIX = resources.resourcePrefix;
    }

    if (handlerName === 'webhook') {
      environment.WEBHOOK_DEV_TOKEN_SECRET_ARN = resources.webhookDevTokenSecret.secretArn;
    }

    if (handlerName === 'session') {
      environment.CHECKIN_EMAIL_BASE_URL = resources.checkinEmailBaseUrl;
      environment.CHECKIN_SMS_BASE_URL = resources.checkinSmsBaseUrl;
      environment.CHECKIN_LINK_DEV_TOKEN_SECRET_ARN = resources.checkinLinkDevTokenSecret.secretArn;
      environment.EMAIL_FROM_ADDRESS = resources.checkinEmailFromAddress;
      environment.EMAIL_PROVIDER = 'aws_ses';
      environment.EMAIL_REPLY_TO_ADDRESSES = resources.checkinEmailReplyToAddresses.join(',');
      environment.SMS_PROVIDER = 'aws_sns';
      environment.SMS_SENDER_ID = 'JumpYard';
      environment.STAFF_AUTH_SECRET_ARN = resources.staffAuthSecret.secretArn;
    }

    if (handlerName === 'redeem') {
      environment.ENABLE_ROLLER_REDEEM_WRITES = 'true';
      environment.REDEEM_DEV_TOKEN_SECRET_ARN = resources.redeemDevTokenSecret.secretArn;
      environment.STAFF_AUTH_SECRET_ARN = resources.staffAuthSecret.secretArn;
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
