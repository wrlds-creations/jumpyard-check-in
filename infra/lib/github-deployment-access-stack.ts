import { CfnOutput, Duration, Stack, type StackProps, Tags } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

const ACCOUNT = '376129878018';
const REGION = 'eu-north-1';
const REPOSITORY = 'wrlds-creations/jumpyard-check-in';
const STACK_NAME = 'jumpyard-check-in-park-test-stack';
const RESOURCE_PREFIX = 'jumpyard-check-in-park-test';
const OIDC_PROVIDER_ARN = `arn:aws:iam::${ACCOUNT}:oidc-provider/token.actions.githubusercontent.com`;

const REQUIRED_TAGS: Readonly<Record<string, string>> = {
  'WRLDS:Client': 'JumpYard',
  'WRLDS:Project': 'jumpyard-check-in',
  'WRLDS:Environment': 'park-test',
  'WRLDS:Owner': 'love',
  'WRLDS:Repository': REPOSITORY,
  'WRLDS:ManagedBy': 'cdk',
  'WRLDS:DataClassification': 'confidential',
  'WRLDS:Exportable': 'true',
  'WRLDS:CostCenter': 'unassigned',
  'WRLDS:CreatedBy': 'love',
};

function githubPrincipal(subject: string): iam.FederatedPrincipal {
  return new iam.FederatedPrincipal(
    OIDC_PROVIDER_ARN,
    {
      StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        'token.actions.githubusercontent.com:sub': subject,
      },
    },
    'sts:AssumeRoleWithWebIdentity',
  );
}

export class GitHubDeploymentAccessStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    if (Stack.of(this).account !== ACCOUNT || Stack.of(this).region !== REGION) {
      throw new Error(`GitHub deployment access must target ${ACCOUNT}/${REGION}.`);
    }

    const stackArn = `arn:aws:cloudformation:${REGION}:${ACCOUNT}:stack/${STACK_NAME}/*`;
    const planRole = new iam.Role(this, 'PlanRole', {
      assumedBy: githubPrincipal(`repo:${REPOSITORY}:ref:refs/heads/main`),
      description: 'Read-only GitHub Actions plan access for JumpYard park-test releases.',
      maxSessionDuration: Duration.hours(1),
      roleName: `${RESOURCE_PREFIX}-github-actions-plan`,
    });

    planRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'cloudformation:DescribeStacks',
          'cloudformation:GetTemplate',
          'cloudformation:ListStackResources',
        ],
        resources: [stackArn],
      }),
    );

    const deployRole = new iam.Role(this, 'DeployRole', {
      assumedBy: githubPrincipal(`repo:${REPOSITORY}:environment:park-test`),
      description: 'Approved GitHub Actions deploy and verification access for JumpYard park-test.',
      maxSessionDuration: Duration.hours(1),
      roleName: `${RESOURCE_PREFIX}-github-actions-deploy`,
    });

    const bootstrapRoleNames = [
      'cdk-hnb659fds-deploy-role',
      'cdk-hnb659fds-file-publishing-role',
      'cdk-hnb659fds-image-publishing-role',
      'cdk-hnb659fds-lookup-role',
    ];
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole', 'sts:TagSession'],
        resources: bootstrapRoleNames.map(
          (roleName) => `arn:aws:iam::${ACCOUNT}:role/${roleName}-${ACCOUNT}-${REGION}`,
        ),
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'cloudformation:DescribeStackEvents',
          'cloudformation:DescribeStacks',
          'cloudformation:DescribeStackResourceDrifts',
          'cloudformation:DetectStackDrift',
          'cloudformation:GetTemplate',
          'cloudformation:ListStackResources',
        ],
        resources: [stackArn],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudformation:DescribeStackDriftDetectionStatus'],
        resources: ['*'],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [`arn:aws:ssm:${REGION}:${ACCOUNT}:parameter/cdk-bootstrap/hnb659fds/version`],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:DescribeSecret', 'secretsmanager:GetSecretValue'],
        resources: [`arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:/${RESOURCE_PREFIX}/aurora/admin-*`],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'rds-data:BeginTransaction',
          'rds-data:CommitTransaction',
          'rds-data:ExecuteStatement',
          'rds-data:RollbackTransaction',
        ],
        resources: [`arn:aws:rds:${REGION}:${ACCOUNT}:cluster:${RESOURCE_PREFIX}-aurora`],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['rds:DescribeDBClusters'],
        resources: ['*'],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:DescribeAlarms'],
        resources: ['*'],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sqs:ListQueues'],
        resources: ['*'],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sqs:GetQueueAttributes', 'sqs:GetQueueUrl'],
        resources: [`arn:aws:sqs:${REGION}:${ACCOUNT}:${RESOURCE_PREFIX}-*`],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['lambda:GetFunctionConfiguration'],
        resources: [`arn:aws:lambda:${REGION}:${ACCOUNT}:function:${RESOURCE_PREFIX}-*`],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['apigateway:GET'],
        resources: [`arn:aws:apigateway:${REGION}::/apis*`],
      }),
    );

    for (const [key, value] of Object.entries(REQUIRED_TAGS)) {
      Tags.of(this).add(key, value);
    }

    new CfnOutput(this, 'PlanRoleArn', { value: planRole.roleArn });
    new CfnOutput(this, 'DeployRoleArn', { value: deployRole.roleArn });
  }
}
