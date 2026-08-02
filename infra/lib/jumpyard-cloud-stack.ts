import { Stack, StackProps, Tags, CfnOutput, CustomResource, Duration, RemovalPolicy, ArnFormat } from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as path from 'path';
import {
  ADMIN_MANAGED_LOGIN_BRANDING_SETTINGS,
} from './admin-managed-login-branding';
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
  readonly checkinEmailConfigurationSetName: string;
  readonly checkinEmailFromAddress: string;
  readonly checkinEmailFromDisplayName: string;
  readonly checkinEmailIdentityDomain: string;
  readonly checkinEmailReplyToAddresses: readonly string[];
  readonly checkinSmsBaseUrl: string;
  readonly rollerCredentialsSecret: secretsmanager.Secret;
  readonly databaseClusterArn: string;
  readonly databaseAdminSecret: secretsmanager.Secret;
  readonly databaseRuntimeRoleProvisioner?: CustomResource;
  readonly databaseRuntimeSecrets?: Readonly<Record<RuntimeDatabaseHandler, secretsmanager.Secret>>;
  readonly rawPayloadBucket: s3.Bucket;
  readonly rollerOperationsQueue: sqs.Queue;
  readonly eventBus: events.EventBus;
  readonly rollerEnvParameter: ssm.StringParameter;
  readonly rollerBaseUrlParameter: ssm.StringParameter;
  readonly webhookDevTokenSecret: secretsmanager.Secret;
  readonly redeemDevTokenSecret: secretsmanager.Secret;
  readonly staffAuthSecret: secretsmanager.Secret;
  readonly staffCognitoClientId?: string;
  readonly staffIdentity: JumpYardCloudConfig['staffIdentity'];
  readonly checkinLinkDevTokenSecret: secretsmanager.Secret;
  readonly resourcePrefix: string;
  readonly safetyGates: JumpYardCloudConfig['safetyGates'];
  readonly webhookProcessing: JumpYardCloudConfig['webhookProcessing'];
  readonly webhookQueue: sqs.Queue;
  readonly wrldsEnvironment: string;
}

type RuntimeDatabaseHandler = 'booking' | 'data-sync' | 'lookup' | 'redeem' | 'session' | 'webhook';

const RUNTIME_DATABASE_ROLES: Readonly<Record<RuntimeDatabaseHandler, string>> = {
  booking: 'jumpyard_booking_runtime',
  'data-sync': 'jumpyard_data_sync_runtime',
  lookup: 'jumpyard_lookup_runtime',
  redeem: 'jumpyard_redeem_runtime',
  session: 'jumpyard_session_runtime',
  webhook: 'jumpyard_webhook_runtime',
};

const LIFECYCLE_DATABASE_ROLE = 'jumpyard_lifecycle_runtime';
const DATABASE_RUNTIME_ROLE_CONFIGURATION_VERSION = 't0195-v1';

interface CognitoAdminIdentityResources {
  readonly authorizer: apigatewayv2.CfnAuthorizer;
  readonly domain: cognito.UserPoolDomain;
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
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
  readonly webhookDeadLetterQueue: sqs.Queue;
  readonly webhookProcessorHandler: lambda.Function;
  readonly webhookQueue: sqs.Queue;
}

type ApiRouteHandler = 'booking' | 'lookup' | 'redeem' | 'session' | 'webhook';
type ApiRouteAuthorizationType = 'AWS_IAM' | 'JWT' | 'NONE';
type ApiRouteTrustClass =
  | 'staff_admin'
  | 'staff_admin_session'
  | 'guest_public'
  | 'guest_token'
  | 'guest_write'
  | 'internal_ops'
  | 'legacy_dev_only'
  | 'roller_webhook'
  | 'staff_auth_entry'
  | 'staff_identity_session'
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

function buildApiRouteProtectionCatalog(
  staffIdentityMode: JumpYardCloudConfig['staffIdentity']['mode'],
): readonly ApiRouteProtection[] {
  if (staffIdentityMode !== 'pin') return API_ROUTE_PROTECTION_CATALOG;

  return [
    ...API_ROUTE_PROTECTION_CATALOG,
    {
      authorizationType: 'NONE',
      handler: 'session',
      routeKey: 'POST /v1/staff/auth/session',
      throttlingBurstLimit: 10,
      throttlingRateLimit: 2,
      trustClass: 'staff_identity_session',
    },
    {
      authorizationType: 'JWT',
      handler: 'session',
      routeKey: 'POST /v1/admin/auth/session',
      throttlingBurstLimit: 10,
      throttlingRateLimit: 2,
      trustClass: 'staff_admin_session',
    },
    {
      authorizationType: 'JWT',
      handler: 'session',
      routeKey: 'GET /v1/admin/staff',
      throttlingBurstLimit: 50,
      throttlingRateLimit: 20,
      trustClass: 'staff_admin',
    },
    {
      authorizationType: 'JWT',
      handler: 'session',
      routeKey: 'POST /v1/admin/staff',
      throttlingBurstLimit: 10,
      throttlingRateLimit: 2,
      trustClass: 'staff_admin',
    },
    {
      authorizationType: 'JWT',
      handler: 'session',
      routeKey: 'PATCH /v1/admin/staff/{staffIdentityId}',
      throttlingBurstLimit: 10,
      throttlingRateLimit: 2,
      trustClass: 'staff_admin',
    },
  ];
}

function buildApiRouteSettings(routeCatalog: readonly ApiRouteProtection[]): Record<
  string,
  { readonly DetailedMetricsEnabled: boolean; readonly ThrottlingBurstLimit: number; readonly ThrottlingRateLimit: number }
> {
  return Object.fromEntries(
    routeCatalog.map((route) => [
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
      description:
        config.staffIdentity.mode === 'pin'
          ? 'Server-only pepper for park staff PIN lookup and verification.'
          : 'Pilot staff passcode used to issue short-lived JumpYard Cloud staff tokens.',
      generateSecretString:
        config.staffIdentity.mode === 'pin'
          ? {
              secretStringTemplate: JSON.stringify({ purpose: 'staff-pin-pepper', version: 1 }),
              generateStringKey: 'pinPepper',
              excludePunctuation: true,
              passwordLength: 64,
            }
          : {
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

    for (const retainedSecret of [
      rollerCredentialsSecret,
      webhookDevTokenSecret,
      redeemDevTokenSecret,
      staffAuthSecret,
      checkinLinkDevTokenSecret,
      databaseSecret,
    ]) {
      retainedSecret.applyRemovalPolicy(RemovalPolicy.RETAIN);
    }

    const restrictedDatabaseAccessRequired = config.tags['WRLDS:Environment'] !== 'dev';
    const databaseRuntimeSecrets = restrictedDatabaseAccessRequired
      ? (Object.fromEntries(
          (Object.entries(RUNTIME_DATABASE_ROLES) as Array<[RuntimeDatabaseHandler, string]>).map(
            ([handlerName, username]) => {
              const logicalName = handlerName
                .split('-')
                .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
                .join('');
              const secret = new secretsmanager.Secret(this, `DatabaseRuntime${logicalName}Secret`, {
                secretName: `/${config.resourcePrefix}/aurora/runtime/${handlerName}`,
                description: `Restricted Aurora Data API credentials for the ${handlerName} Lambda only.`,
                generateSecretString: {
                  secretStringTemplate: JSON.stringify({ username }),
                  generateStringKey: 'password',
                  excludePunctuation: true,
                  passwordLength: 48,
                },
              });
              secret.applyRemovalPolicy(RemovalPolicy.RETAIN);
              return [handlerName, secret];
            },
          ),
        ) as Record<RuntimeDatabaseHandler, secretsmanager.Secret>)
      : undefined;

    const databaseLifecycleSecret = restrictedDatabaseAccessRequired
      ? new secretsmanager.Secret(this, 'DatabaseLifecycleSecret', {
          secretName: `/${config.resourcePrefix}/aurora/lifecycle`,
          description: 'Restricted Aurora Data API credentials for approved lifecycle maintenance only.',
          generateSecretString: {
            secretStringTemplate: JSON.stringify({ username: LIFECYCLE_DATABASE_ROLE }),
            generateStringKey: 'password',
            excludePunctuation: true,
            passwordLength: 48,
          },
        })
      : undefined;
    databaseLifecycleSecret?.applyRemovalPolicy(RemovalPolicy.RETAIN);

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

    let databaseRuntimeRoleProvisioner: CustomResource | undefined;
    if (databaseRuntimeSecrets && databaseLifecycleSecret) {
      const provisionerFunctionName = `${config.resourcePrefix}-database-runtime-role-provisioner`;
      const provisionerLogGroup = new logs.LogGroup(this, 'DatabaseRuntimeRoleProvisionerLogGroup', {
        logGroupName: `/aws/lambda/${provisionerFunctionName}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      const provisioner = new lambda.Function(this, 'DatabaseRuntimeRoleProvisionerHandler', {
        functionName: provisionerFunctionName,
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        timeout: Duration.minutes(2),
        environment: {
          DATABASE_ADMIN_SECRET_ARN: databaseSecret.secretArn,
          DATABASE_CLUSTER_ARN: databaseClusterArn,
          RUNTIME_ROLE_SECRETS_JSON: JSON.stringify(
            Object.fromEntries([
              ...(Object.entries(RUNTIME_DATABASE_ROLES) as Array<[RuntimeDatabaseHandler, string]>).map(
                ([handlerName, roleName]) => [roleName, databaseRuntimeSecrets[handlerName].secretArn],
              ),
              [LIFECYCLE_DATABASE_ROLE, databaseLifecycleSecret.secretArn],
            ]),
          ),
        },
        code: lambda.Code.fromInline(`
const { ExecuteStatementCommand, RDSDataClient } = require('@aws-sdk/client-rds-data');
const { GetSecretValueCommand, SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
const rds = new RDSDataClient({});
const secrets = new SecretsManagerClient({});
const allowedRoles = ${JSON.stringify([
  ...Object.values(RUNTIME_DATABASE_ROLES),
  LIFECYCLE_DATABASE_ROLE,
])};

exports.handler = async (event) => {
  const physicalResourceId = 'jumpyard-database-runtime-role-provisioner-v1';
  if (event.RequestType === 'Delete') return { PhysicalResourceId: physicalResourceId };

  const clusterArn = process.env.DATABASE_CLUSTER_ARN;
  const adminSecretArn = process.env.DATABASE_ADMIN_SECRET_ARN;
  const roleSecrets = JSON.parse(process.env.RUNTIME_ROLE_SECRETS_JSON || '{}');
  if (!clusterArn || !adminSecretArn) {
    throw new Error('Runtime database role provisioning properties are incomplete.');
  }

  let updated = 0;
  for (const roleName of allowedRoles) {
    if (!/^[a-z][a-z0-9_]{2,62}$/.test(roleName) || typeof roleSecrets[roleName] !== 'string') {
      throw new Error('Runtime database role provisioning allowlist is invalid.');
    }
    const response = await secrets.send(new GetSecretValueCommand({ SecretId: roleSecrets[roleName] }));
    const secret = JSON.parse(response.SecretString || '{}');
    if (secret.username !== roleName || !/^[A-Za-z0-9]{32,128}$/.test(secret.password || '')) {
      throw new Error('Runtime database credential shape is invalid.');
    }
    const escapedPassword = secret.password.replace(/'/g, "''");
    try {
      await rds.send(new ExecuteStatementCommand({
        database: 'jumpyard_cloud',
        resourceArn: clusterArn,
        secretArn: adminSecretArn,
        sql: 'ALTER ROLE ' + roleName + " PASSWORD '" + escapedPassword + "' VALID UNTIL 'infinity'",
      }));
    } catch {
      // Do not let a provider/database error serialize the SQL request or the
      // generated credential into the custom-resource log stream.
      throw new Error('Runtime database role provisioning failed.');
    }
    updated += 1;
  }

  return { PhysicalResourceId: physicalResourceId, Data: { UpdatedRoleCount: updated } };
};
`),
      });
      provisioner.node.addDependency(provisionerLogGroup);
      databaseSecret.grantRead(provisioner);
      for (const runtimeSecret of Object.values(databaseRuntimeSecrets)) runtimeSecret.grantRead(provisioner);
      databaseLifecycleSecret.grantRead(provisioner);
      provisioner.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['rds-data:ExecuteStatement'],
          resources: [databaseClusterArn],
        }),
      );

      const providerLogGroup = new logs.LogGroup(this, 'DatabaseRuntimeRoleProviderLogGroup', {
        logGroupName: `/aws/lambda/${config.resourcePrefix}-database-runtime-role-provider`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      const provider = new cr.Provider(this, 'DatabaseRuntimeRoleProvider', {
        onEventHandler: provisioner,
        logGroup: providerLogGroup,
        providerFunctionName: `${config.resourcePrefix}-database-runtime-role-provider`,
      });
      databaseRuntimeRoleProvisioner = new CustomResource(this, 'DatabaseRuntimeRoleProvisioning', {
        serviceToken: provider.serviceToken,
        properties: {
          ConfigurationVersion: DATABASE_RUNTIME_ROLE_CONFIGURATION_VERSION,
        },
      });
      databaseRuntimeRoleProvisioner.node.addDependency(databaseCluster);
      databaseRuntimeRoleProvisioner.node.addDependency(databaseWriter);
    }

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

    const webhookDeadLetterQueue = new sqs.Queue(this, 'WebhookDeadLetterQueue', {
      queueName: `${config.resourcePrefix}-webhook-events-dlq.fifo`,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      fifo: true,
      retentionPeriod: Duration.days(14),
    });

    const webhookQueue = new sqs.Queue(this, 'WebhookQueue', {
      queueName: `${config.resourcePrefix}-webhook-events.fifo`,
      contentBasedDeduplication: false,
      deadLetterQueue: {
        maxReceiveCount: 5,
        queue: webhookDeadLetterQueue,
      },
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      fifo: true,
      retentionPeriod: Duration.days(4),
      visibilityTimeout: Duration.minutes(12),
    });

    const eventBus = new events.EventBus(this, 'EventBus', {
      eventBusName: `${config.resourcePrefix}-events`,
    });

    if (config.guestEmail.identityDomain) {
      const emailConfigurationSet = new ses.ConfigurationSet(this, 'GuestEmailConfigurationSet', {
        configurationSetName: config.guestEmail.configurationSetName,
        reputationMetrics: true,
        sendingEnabled: false,
        suppressionReasons: ses.SuppressionReasons.BOUNCES_AND_COMPLAINTS,
        tlsPolicy: ses.ConfigurationSetTlsPolicy.REQUIRE,
      });

      emailConfigurationSet.addEventDestination('GuestEmailCloudWatchEventDestination', {
        configurationSetEventDestinationName: `${config.resourcePrefix}-email-cloudwatch`,
        destination: ses.EventDestination.cloudWatchDimensions([
          {
            defaultValue: config.guestEmail.configurationSetName,
            name: 'ses:configuration-set',
            source: ses.CloudWatchDimensionSource.MESSAGE_TAG,
          },
        ]),
        events: [
          ses.EmailSendingEvent.SEND,
          ses.EmailSendingEvent.DELIVERY,
          ses.EmailSendingEvent.BOUNCE,
          ses.EmailSendingEvent.COMPLAINT,
          ses.EmailSendingEvent.REJECT,
          ses.EmailSendingEvent.RENDERING_FAILURE,
        ],
      });

      const emailIdentity = new ses.EmailIdentity(this, 'GuestEmailIdentity', {
        configurationSet: emailConfigurationSet,
        dkimIdentity: ses.DkimIdentity.easyDkim(ses.EasyDkimSigningKeyLength.RSA_2048_BIT),
        dkimSigning: true,
        feedbackForwarding: false,
        identity: ses.Identity.domain(config.guestEmail.identityDomain),
      });

      new CfnOutput(this, 'GuestEmailConfigurationSetName', {
        value: emailConfigurationSet.configurationSetName,
      });
      new CfnOutput(this, 'GuestEmailIdentityDomain', {
        value: emailIdentity.emailIdentityName,
      });
      new CfnOutput(this, 'GuestEmailDkimRecordName1', {
        value: emailIdentity.dkimDnsTokenName1,
      });
      new CfnOutput(this, 'GuestEmailDkimRecordValue1', {
        value: emailIdentity.dkimDnsTokenValue1,
      });
      new CfnOutput(this, 'GuestEmailDkimRecordName2', {
        value: emailIdentity.dkimDnsTokenName2,
      });
      new CfnOutput(this, 'GuestEmailDkimRecordValue2', {
        value: emailIdentity.dkimDnsTokenValue2,
      });
      new CfnOutput(this, 'GuestEmailDkimRecordName3', {
        value: emailIdentity.dkimDnsTokenName3,
      });
      new CfnOutput(this, 'GuestEmailDkimRecordValue3', {
        value: emailIdentity.dkimDnsTokenValue3,
      });
    }

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
        allowMethods:
          config.staffIdentity.mode === 'pin'
            ? ['GET', 'OPTIONS', 'PATCH', 'POST']
            : ['GET', 'OPTIONS', 'POST'],
        allowOrigins: [...config.api.allowedCorsOrigins],
        maxAge: 300,
      },
    });

    const routeProtectionCatalog = buildApiRouteProtectionCatalog(config.staffIdentity.mode);
    const adminIdentityResources =
      config.staffIdentity.mode === 'pin' ? this.createCognitoAdminIdentity(config, api) : undefined;

    const apiAccessLogGroup = new logs.LogGroup(this, 'HttpApiAccessLogGroup', {
      logGroupName: `/aws/apigateway/${config.resourcePrefix}-api-access`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const defaultStage = new apigatewayv2.CfnStage(this, 'DefaultStage', {
      apiId: api.ref,
      accessLogSettings: {
        // CloudWatch Logs exposes LogGroup.Arn with a trailing `:*`, while
        // API Gateway stores the stage destination without that suffix. Build
        // the destination from the known log-group name so CloudFormation
        // drift detection compares the same canonical ARN that API Gateway
        // persists.
        destinationArn: Stack.of(this).formatArn({
          service: 'logs',
          resource: 'log-group',
          resourceName: apiAccessLogGroup.logGroupName,
          arnFormat: ArnFormat.COLON_RESOURCE_NAME,
        }),
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
      routeSettings: buildApiRouteSettings(routeProtectionCatalog),
      stageName: '$default',
    });
    defaultStage.addDependency(apiAccessLogGroup.node.defaultChild as logs.CfnLogGroup);

    const handlerResources: HandlerResources = {
      api,
      checkinEmailBaseUrl: config.guestEmail.checkinBaseUrl,
      checkinEmailConfigurationSetName: config.guestEmail.configurationSetName,
      checkinEmailFromAddress: config.guestEmail.fromAddress,
      checkinEmailFromDisplayName: config.guestEmail.fromDisplayName,
      checkinEmailIdentityDomain: config.guestEmail.identityDomain,
      checkinEmailReplyToAddresses: config.guestEmail.replyToAddresses,
      checkinSmsBaseUrl: config.bookingTimeSms.checkinBaseUrl,
      rollerCredentialsSecret,
      databaseClusterArn,
      databaseAdminSecret: databaseSecret,
      databaseRuntimeRoleProvisioner,
      databaseRuntimeSecrets,
      rawPayloadBucket,
      rollerOperationsQueue,
      eventBus,
      rollerEnvParameter,
      rollerBaseUrlParameter,
      webhookDevTokenSecret,
      redeemDevTokenSecret,
      staffAuthSecret,
      staffCognitoClientId: adminIdentityResources?.userPoolClient.userPoolClientId,
      staffIdentity: config.staffIdentity,
      checkinLinkDevTokenSecret,
      resourcePrefix: config.resourcePrefix,
      safetyGates: config.safetyGates,
      webhookProcessing: config.webhookProcessing,
      webhookQueue,
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
      environment: {
        WEBHOOK_RUNTIME_MODE: 'intake',
      },
    });
    const webhookProcessorHandler = this.createHandler('WebhookProcessorHandler', 'webhook', handlerResources, {
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'webhook')),
      environment: {
        WEBHOOK_RUNTIME_MODE: 'processor',
      },
      functionNameSuffix: 'webhook-processor',
      memorySize: 512,
      reservedConcurrentExecutions: 1,
      timeout: Duration.minutes(2),
    });
    webhookQueue.grantSendMessages(webhookHandler);
    webhookQueue.grantConsumeMessages(webhookProcessorHandler);
    webhookProcessorHandler.addEventSource(
      new SqsEventSource(webhookQueue, {
        batchSize: 1,
        reportBatchItemFailures: true,
      }),
    );
    const dataSyncHandler = this.createHandler('DataSyncHandler', 'data-sync', handlerResources, {
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'data-sync')),
      dataSync: config.dataSync,
      memorySize: 512,
      reservedConcurrentExecutions: 1,
      timeout: Duration.minutes(10),
    });

    new events.Rule(this, 'DailyDataApiSyncRule', {
      ruleName: `${config.resourcePrefix}-data-api-daily-sync`,
      description:
        'Runs the approved serialized Roller Data API modified-date morning sync. Roller writes are not performed.',
      enabled: config.dataSync.scheduleEnabled,
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

    new events.Rule(this, 'WebhookRecoveryRule', {
      ruleName: `${config.resourcePrefix}-webhook-recovery`,
      description: 'Reconciles durably received webhook events that were not completed by the queue worker.',
      enabled: config.webhookProcessing.recoveryScheduleEnabled,
      schedule: events.Schedule.rate(Duration.minutes(5)),
      targets: [
        new targets.LambdaFunction(webhookProcessorHandler, {
          event: events.RuleTargetInput.fromObject({
            source: 'jumpyard.webhook-recovery',
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

    for (const protection of routeProtectionCatalog) {
      const route = this.addRoute(
        api,
        apiHandlers[protection.handler],
        protection,
        adminIdentityResources?.authorizer.ref,
      );
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
      webhookDeadLetterQueue,
      webhookProcessorHandler,
      webhookQueue,
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

    new CfnOutput(this, 'WebhookQueueUrl', {
      value: webhookQueue.queueUrl,
    });

    new CfnOutput(this, 'WebhookProcessorFunctionName', {
      value: webhookProcessorHandler.functionName,
    });

    if (adminIdentityResources) {
      new CfnOutput(this, 'AdminUserPoolId', {
        value: adminIdentityResources.userPool.userPoolId,
      });
      new CfnOutput(this, 'AdminUserPoolClientId', {
        value: adminIdentityResources.userPoolClient.userPoolClientId,
      });
      new CfnOutput(this, 'AdminUserPoolDomain', {
        value: `https://${adminIdentityResources.domain.domainName}.auth.${this.region}.amazoncognito.com`,
      });
    }
  }

  private addOperationalObservability(config: JumpYardCloudConfig, resources: ObservabilityResources): void {
    const period = Duration.minutes(5);
    const lambdaHandlers = [
      { id: 'Lookup', name: 'lookup', fn: resources.lookupHandler },
      { id: 'Booking', name: 'booking', fn: resources.bookingHandler },
      { id: 'Redeem', name: 'redeem', fn: resources.redeemHandler },
      { id: 'Session', name: 'session', fn: resources.sessionHandler },
      { id: 'Webhook', name: 'webhook', fn: resources.webhookHandler },
      { id: 'WebhookProcessor', name: 'webhook-processor', fn: resources.webhookProcessorHandler },
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
    const bookingIndexSyncSuccess = new cloudwatch.Metric({
      namespace: 'JumpYard/Cloud',
      metricName: 'BookingIndexSyncSuccess',
      dimensionsMap: {
        Environment: config.resourcePrefix,
        Handler: 'data-sync',
      },
      statistic: 'Sum',
      period: Duration.hours(6),
    });
    const webhookProcessingFailures = new cloudwatch.Metric({
      namespace: 'JumpYard/Cloud',
      metricName: 'WebhookProcessingFailure',
      dimensionsMap: {
        Environment: config.resourcePrefix,
        Handler: 'webhook',
      },
      statistic: 'Sum',
      period,
    });
    const webhookRetryExhausted = new cloudwatch.Metric({
      namespace: 'JumpYard/Cloud',
      metricName: 'WebhookRetryExhausted',
      dimensionsMap: {
        Environment: config.resourcePrefix,
        Handler: 'webhook',
      },
      statistic: 'Sum',
      period,
    });
    const guestEmailMetric = (metricName: string) =>
      new cloudwatch.Metric({
        namespace: 'AWS/SES',
        metricName,
        dimensionsMap: {
          'ses:configuration-set': config.guestEmail.configurationSetName,
        },
        statistic: 'Sum',
        period,
      });
    const sesAccountBounceRate = new cloudwatch.Metric({
      namespace: 'AWS/SES',
      metricName: 'Reputation.BounceRate',
      statistic: 'Average',
      period,
    });
    const sesAccountComplaintRate = new cloudwatch.Metric({
      namespace: 'AWS/SES',
      metricName: 'Reputation.ComplaintRate',
      statistic: 'Average',
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
          resources.webhookQueue
            .metricApproximateNumberOfMessagesVisible({ statistic: 'Maximum', period })
            .with({ label: 'webhook visible' }),
          resources.webhookDeadLetterQueue
            .metricApproximateNumberOfMessagesVisible({ statistic: 'Maximum', period })
            .with({ label: 'webhook dlq visible' }),
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

    if (config.guestEmail.configurationSetName) {
      dashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: 'Guest email delivery outcomes',
          left: [
            guestEmailMetric('Send').with({ label: 'send' }),
            guestEmailMetric('Delivery').with({ label: 'delivery' }),
          ],
          right: [
            guestEmailMetric('Bounce').with({ label: 'bounce' }),
            guestEmailMetric('Complaint').with({ label: 'complaint' }),
            guestEmailMetric('Reject').with({ label: 'reject' }),
            guestEmailMetric('RenderingFailure').with({ label: 'rendering failure' }),
          ],
          width: 12,
        }),
        new cloudwatch.GraphWidget({
          title: 'SES account reputation',
          left: [sesAccountBounceRate.with({ label: 'bounce rate' })],
          right: [sesAccountComplaintRate.with({ label: 'complaint rate' })],
          width: 12,
        }),
      );
    }

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

    if (config.guestEmail.configurationSetName) {
      for (const event of ['Bounce', 'Complaint', 'Reject', 'RenderingFailure'] as const) {
        new cloudwatch.Alarm(this, `GuestEmail${event}Alarm`, {
          alarmName: `${config.resourcePrefix}-email-${event.toLowerCase()}`,
          alarmDescription: `The park-test SES configuration set reported a ${event} event.`,
          metric: guestEmailMetric(event),
          threshold: 1,
          evaluationPeriods: 1,
          datapointsToAlarm: 1,
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
      }

      new cloudwatch.Alarm(this, 'SesAccountBounceRateAlarm', {
        alarmName: `${config.resourcePrefix}-email-account-bounce-rate`,
        alarmDescription: 'SES account bounce rate reached the proactive two-percent warning threshold.',
        metric: sesAccountBounceRate,
        threshold: 0.02,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      new cloudwatch.Alarm(this, 'SesAccountComplaintRateAlarm', {
        alarmName: `${config.resourcePrefix}-email-account-complaint-rate`,
        alarmDescription: 'SES account complaint rate reached the proactive 0.05-percent warning threshold.',
        metric: sesAccountComplaintRate,
        threshold: 0.0005,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    }

    new cloudwatch.Alarm(this, 'RollerOpsDlqVisibleAlarm', {
      alarmName: `${config.resourcePrefix}-roller-ops-dlq-visible`,
      metric: resources.deadLetterQueue.metricApproximateNumberOfMessagesVisible({ statistic: 'Maximum', period }),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'WebhookDlqVisibleAlarm', {
      alarmName: `${config.resourcePrefix}-webhook-dlq-visible`,
      metric: resources.webhookDeadLetterQueue.metricApproximateNumberOfMessagesVisible({
        statistic: 'Maximum',
        period,
      }),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'WebhookQueueAgeAlarm', {
      alarmName: `${config.resourcePrefix}-webhook-queue-stale`,
      alarmDescription: 'A durable Roller webhook signal has waited more than five minutes for reconciliation.',
      metric: resources.webhookQueue.metricApproximateAgeOfOldestMessage({ statistic: 'Maximum', period }),
      threshold: 300,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'WebhookProcessingFailureAlarm', {
      alarmName: `${config.resourcePrefix}-webhook-processing-failures`,
      alarmDescription: 'The Roller webhook worker failed an authoritative reconciliation attempt.',
      metric: webhookProcessingFailures,
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'WebhookRetryExhaustedAlarm', {
      alarmName: `${config.resourcePrefix}-webhook-retry-exhausted`,
      alarmDescription: 'A Roller webhook event reached the automatic reconciliation attempt limit.',
      metric: webhookRetryExhausted,
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    if (config.dataSync.scheduleEnabled) {
      new cloudwatch.Alarm(this, 'BookingIndexFreshnessAlarm', {
        alarmName: `${config.resourcePrefix}-booking-index-stale`,
        alarmDescription: 'No successful booking-index seed has been observed for five consecutive six-hour periods.',
        metric: bookingIndexSyncSuccess,
        threshold: 1,
        evaluationPeriods: 5,
        datapointsToAlarm: 5,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      });
    }

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

  private createCognitoAdminIdentity(
    config: JumpYardCloudConfig,
    api: apigatewayv2.CfnApi,
  ): CognitoAdminIdentityResources {
    if (config.staffIdentity.mode !== 'pin') {
      throw new Error('Cognito admin identity resources require staffIdentity.mode=pin.');
    }

    const userPool = new cognito.UserPool(this, 'AdminUserPool', {
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      autoVerify: { email: true },
      deletionProtection: true,
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: {
        otp: true,
        sms: false,
      },
      passwordPolicy: {
        minLength: 8,
        passwordHistorySize: 5,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: false,
        requireUppercase: true,
        tempPasswordValidity: Duration.days(7),
      },
      removalPolicy: RemovalPolicy.RETAIN,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      standardAttributes: {
        email: {
          mutable: true,
          required: true,
        },
      },
      standardThreatProtectionMode: cognito.StandardThreatProtectionMode.NO_ENFORCEMENT,
      userPoolName: `${config.resourcePrefix}-admin`,
    });

    const userPoolClient = userPool.addClient('AdminUserPoolClient', {
      accessTokenValidity: Duration.minutes(config.staffIdentity.accessTokenValidityMinutes),
      authFlows: {
        userSrp: true,
      },
      enableTokenRevocation: true,
      generateSecret: false,
      idTokenValidity: Duration.minutes(config.staffIdentity.accessTokenValidityMinutes),
      oAuth: {
        callbackUrls: [...config.staffIdentity.callbackUrls],
        flows: {
          authorizationCodeGrant: true,
          clientCredentials: false,
          implicitCodeGrant: false,
        },
        logoutUrls: [...config.staffIdentity.logoutUrls],
        scopes: [cognito.OAuthScope.OPENID],
      },
      preventUserExistenceErrors: true,
      refreshTokenValidity: Duration.hours(config.staffIdentity.refreshTokenValidityHours),
      refreshTokenRotationGracePeriod: Duration.seconds(10),
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      userPoolClientName: `${config.resourcePrefix}-admin`,
    });

    const domain = userPool.addDomain('AdminUserPoolDomain', {
      cognitoDomain: {
        domainPrefix: config.staffIdentity.domainPrefix,
      },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    const managedLoginBranding = new cognito.CfnManagedLoginBranding(this, 'AdminManagedLoginBranding', {
      clientId: userPoolClient.userPoolClientId,
      settings: ADMIN_MANAGED_LOGIN_BRANDING_SETTINGS,
      useCognitoProvidedValues: false,
      userPoolId: userPool.userPoolId,
    });
    managedLoginBranding.addDependency(userPoolClient.node.defaultChild as cognito.CfnUserPoolClient);
    managedLoginBranding.addDependency(domain.node.defaultChild as cognito.CfnUserPoolDomain);

    const authorizer = new apigatewayv2.CfnAuthorizer(this, 'AdminJwtAuthorizer', {
      apiId: api.ref,
      authorizerType: 'JWT',
      identitySource: ['$request.header.Authorization'],
      jwtConfiguration: {
        audience: [userPoolClient.userPoolClientId],
        issuer: `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      },
      name: `${config.resourcePrefix}-admin-jwt`,
    });

    return {
      authorizer,
      domain,
      userPool,
      userPoolClient,
    };
  }

  private createHandler(
    id: string,
    handlerName: RuntimeDatabaseHandler,
    resources: HandlerResources,
    options: {
      readonly code?: lambda.Code;
      readonly dataSync?: JumpYardCloudConfig['dataSync'];
      readonly environment?: Readonly<Record<string, string>>;
      readonly functionNameSuffix?: string;
      readonly memorySize?: number;
      readonly reservedConcurrentExecutions?: number;
      readonly timeout?: Duration;
    } = {},
  ): lambda.Function {
    const functionName = `${this.stackName}-${options.functionNameSuffix ?? handlerName}`;
    const handlerDatabaseSecret = resources.databaseRuntimeSecrets?.[handlerName] ?? resources.databaseAdminSecret;

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
      DATABASE_SECRET_ARN: handlerDatabaseSecret.secretArn,
      RESOURCE_PREFIX: resources.resourcePrefix,
      JUMPYARD_EMERGENCY_STOP: String(resources.safetyGates.emergencyStop),
      JUMPYARD_ENVIRONMENT: resources.wrldsEnvironment,
    };

    if (handlerName === 'data-sync') {
      if (!options.dataSync) {
        throw new Error('data-sync handler requires the reviewed dataSync config.');
      }
      environment.ENABLE_ROLLER_LIVE_DATA_SYNC = String(options.dataSync.scheduleEnabled);
      environment.ROLLER_DATA_SYNC_BOOKING_RETENTION_DAYS = String(options.dataSync.bookingRetentionDays);
      environment.ROLLER_DATA_SYNC_LIVE_APPROVAL = options.dataSync.liveApproval;
      environment.ROLLER_DATA_SYNC_MAX_PAGES = String(options.dataSync.maxPages);
      environment.ROLLER_DATA_SYNC_MAX_WINDOW_DAYS = String(options.dataSync.maxWindowDays);
      environment.ROLLER_DATA_SYNC_PAGE_SIZE = String(options.dataSync.pageSize);
      environment.ROLLER_DATA_SYNC_REQUEST_INTERVAL_MS = String(options.dataSync.requestIntervalMs);
      environment.ROLLER_DATA_SYNC_VENUE_ID = options.dataSync.venueId;
    }

    if (handlerName === 'webhook') {
      environment.ENABLE_ROLLER_WEBHOOK_PROCESSING = String(resources.safetyGates.rollerWebhookProcessingEnabled);
      environment.ROLLER_WEBHOOK_BOOKING_RETENTION_DAYS = String(
        resources.webhookProcessing.bookingRetentionDays,
      );
      environment.ROLLER_WEBHOOK_LIVE_APPROVAL = resources.webhookProcessing.liveApproval;
      environment.ROLLER_WEBHOOK_MAX_RECOVERY_ATTEMPTS = String(
        resources.webhookProcessing.maxRecoveryAttempts,
      );
      environment.ROLLER_WEBHOOK_RECOVERY_LIMIT = String(resources.webhookProcessing.recoveryLimit);
      environment.ROLLER_WEBHOOK_REQUEST_INTERVAL_MS = String(resources.webhookProcessing.requestIntervalMs);
      environment.ROLLER_WEBHOOK_VENUE_ID = resources.webhookProcessing.venueId;
      environment.WEBHOOK_AUTH_HEADER = resources.wrldsEnvironment === 'park-test' ? 'x-roller-apikey' : 'legacy';
      environment.WEBHOOK_DEV_TOKEN_SECRET_ARN = resources.webhookDevTokenSecret.secretArn;
      environment.WEBHOOK_QUEUE_URL = resources.webhookQueue.queueUrl;
    }

    Object.assign(environment, options.environment ?? {});

    if (handlerName === 'session' || handlerName === 'redeem') {
      environment.ENABLE_STAFF_AUTH = String(resources.safetyGates.staffAuthEnabled);
      environment.STAFF_IDENTITY_MODE = resources.staffIdentity.mode;
      environment.STAFF_IDENTITY_ENVIRONMENT = resources.wrldsEnvironment;
      if (resources.staffIdentity.mode === 'pin') {
        environment.STAFF_IDENTITY_VENUE_ID = resources.staffIdentity.venueId;
        if (handlerName === 'session') {
          if (!resources.staffCognitoClientId) {
            throw new Error('Cognito admin identity requires a user pool client id.');
          }
          environment.STAFF_COGNITO_CLIENT_ID = resources.staffCognitoClientId;
          environment.STAFF_PIN_PEPPER_SECRET_ARN = resources.staffAuthSecret.secretArn;
        }
      } else {
        environment.STAFF_AUTH_SECRET_ARN = resources.staffAuthSecret.secretArn;
      }
    }

    if (handlerName === 'session') {
      const fullFlowRehearsalEnabled =
        resources.safetyGates.fullFlowRehearsalApproval === PARK_TEST_FULL_FLOW_REHEARSAL_APPROVAL;
      environment.CHECKIN_EMAIL_BASE_URL = resources.checkinEmailBaseUrl;
      environment.CHECKIN_SMS_BASE_URL = resources.checkinSmsBaseUrl;
      environment.CHECKIN_LINK_DEV_TOKEN_SECRET_ARN = resources.checkinLinkDevTokenSecret.secretArn;
      environment.EMAIL_CONFIGURATION_SET_NAME = resources.checkinEmailConfigurationSetName;
      environment.EMAIL_FROM_ADDRESS = resources.checkinEmailFromAddress;
      environment.EMAIL_FROM_DISPLAY_NAME = resources.checkinEmailFromDisplayName;
      environment.EMAIL_PROVIDER = 'aws_ses';
      environment.EMAIL_REPLY_TO_ADDRESSES = resources.checkinEmailReplyToAddresses.join(',');
      environment.ENABLE_GUEST_MESSAGE_SENDS = String(resources.safetyGates.guestMessagingSendsEnabled);
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
      reservedConcurrentExecutions: options.reservedConcurrentExecutions,
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
    handlerDatabaseSecret.grantRead(fn);
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
      if (resources.safetyGates.guestMessagingSendsEnabled) {
        fn.addToRolePolicy(
          new iam.PolicyStatement({
            actions: ['sns:Publish'],
            resources: ['*'],
            conditions: {
              StringEquals: {
                'aws:RequestedRegion': this.region,
              },
            },
          }),
        );
        if (resources.checkinEmailFromAddress && resources.checkinEmailIdentityDomain) {
          fn.addToRolePolicy(
            new iam.PolicyStatement({
              actions: ['ses:SendEmail'],
              conditions: {
                StringEquals: {
                  'ses:FromAddress': resources.checkinEmailFromAddress,
                },
              },
              resources: [
                Stack.of(this).formatArn({
                  service: 'ses',
                  resource: 'identity',
                  resourceName: resources.checkinEmailIdentityDomain,
                  arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
                }),
              ],
            }),
          );
        }
      }
    }
    if ((handlerName === 'session' || handlerName === 'redeem') && resources.staffIdentity.mode === 'legacy') {
      resources.staffAuthSecret.grantRead(fn);
    }
    if (handlerName === 'session' && resources.staffIdentity.mode === 'pin') {
      resources.staffAuthSecret.grantRead(fn);
    }

    const dataApiActions = ['rds-data:ExecuteStatement'];
    if (handlerName === 'session' || handlerName === 'data-sync') {
      dataApiActions.push(
        'rds-data:BeginTransaction',
        'rds-data:CommitTransaction',
        'rds-data:RollbackTransaction',
      );
    }
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: dataApiActions,
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
    if (resources.databaseRuntimeRoleProvisioner) fn.node.addDependency(resources.databaseRuntimeRoleProvisioner);

    return fn;
  }

  private addRoute(
    api: apigatewayv2.CfnApi,
    handler: lambda.Function,
    protection: ApiRouteProtection,
    staffJwtAuthorizerId?: string,
  ): apigatewayv2.CfnRoute {
    if (protection.authorizationType === 'JWT' && !staffJwtAuthorizerId) {
      throw new Error(`JWT route ${protection.routeKey} requires the staff Cognito authorizer.`);
    }

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
      authorizerId: protection.authorizationType === 'JWT' ? staffJwtAuthorizerId : undefined,
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
