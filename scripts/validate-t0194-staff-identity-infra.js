const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const INFRA = path.join(ROOT, 'infra');
const PARK_TEST_STACK_NAME = 'jumpyard-check-in-park-test-stack';
const DEV_STACK_NAME = 'jumpyard-check-in-dev-stack';
const ADMIN_CALLBACK_URL = 'https://jumpyard-checkin-admin-park-test.pages.dev/auth/callback';
const ADMIN_LOGOUT_URL = 'https://jumpyard-checkin-admin-park-test.pages.dev/admin';
const ADMIN_DOMAIN_PREFIX = 'jumpyard-check-in-park-test-admin-376129878018';

function synthTemplate(configPath, stackName) {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpyard-t0194-infra-'));
  const cdkCli = path.join(INFRA, 'node_modules', 'aws-cdk', 'bin', 'cdk');

  try {
    const result = spawnSync(
      process.execPath,
      [cdkCli, 'synth', '-c', `config=${configPath}`, '--quiet', '--output', outputDirectory],
      {
        cwd: INFRA,
        encoding: 'utf8',
        env: { ...process.env, CDK_DISABLE_VERSION_CHECK: '1' },
      },
    );
    if (result.status !== 0) {
      throw new Error(`T0194 CDK synth failed for ${configPath}.\n${result.stdout || ''}${result.stderr || ''}`);
    }

    return JSON.parse(
      fs.readFileSync(path.join(outputDirectory, `${stackName}.template.json`), 'utf8'),
    );
  } finally {
    fs.rmSync(outputDirectory, { force: true, recursive: true });
  }
}

function entriesOfType(template, type) {
  return Object.entries(template.Resources).filter(([, resource]) => resource.Type === type);
}

function onlyResource(template, type) {
  const entries = entriesOfType(template, type);
  assert.equal(entries.length, 1, `Expected exactly one ${type}.`);
  return entries[0];
}

function lambdaEnvironment(template, functionName) {
  const [, fn] = Object.entries(template.Resources).find(
    ([, resource]) =>
      resource.Type === 'AWS::Lambda::Function' && resource.Properties.FunctionName === functionName,
  ) || [];
  assert.ok(fn, `Missing Lambda ${functionName}.`);
  return fn.Properties.Environment.Variables;
}

function routesByKey(template) {
  return new Map(
    entriesOfType(template, 'AWS::ApiGatewayV2::Route').map(([logicalId, route]) => [
      route.Properties.RouteKey,
      { logicalId, route },
    ]),
  );
}

function iamPoliciesReference(template, logicalId) {
  return entriesOfType(template, 'AWS::IAM::Policy').filter(([, policy]) =>
    JSON.stringify(policy.Properties).includes(logicalId),
  );
}

function validateParkTest(template) {
  assert.equal(
    Object.keys(template.Resources).length,
    170,
    'T0194 remains intact inside the 154-resource deployed baseline plus the exact 16-resource T0195 database-identity delta.',
  );

  const [userPoolId, userPool] = onlyResource(template, 'AWS::Cognito::UserPool');
  const [clientId, client] = onlyResource(template, 'AWS::Cognito::UserPoolClient');
  const [domainId, domain] = onlyResource(template, 'AWS::Cognito::UserPoolDomain');
  const [, managedLoginBranding] = onlyResource(template, 'AWS::Cognito::ManagedLoginBranding');
  const [authorizerId, authorizer] = onlyResource(template, 'AWS::ApiGatewayV2::Authorizer');
  const [pinPepperSecretId, pinPepperSecret] = entriesOfType(template, 'AWS::SecretsManager::Secret').find(
    ([, secret]) => secret.Properties.Name === '/jumpyard-check-in-park-test/staff/auth',
  ) || [];

  assert.ok(pinPepperSecretId, 'The existing staff secret container must be repurposed for the PIN pepper.');
  assert.equal(pinPepperSecret.Properties.Description, 'Server-only pepper for park staff PIN lookup and verification.');
  assert.deepEqual(pinPepperSecret.Properties.GenerateSecretString, {
    ExcludePunctuation: true,
    GenerateStringKey: 'pinPepper',
    PasswordLength: 64,
    SecretStringTemplate: '{"purpose":"staff-pin-pepper","version":1}',
  });
  const pinPepperPolicies = iamPoliciesReference(template, pinPepperSecretId);
  assert.equal(pinPepperPolicies.length, 1, 'Only the session Lambda may read the PIN pepper.');
  assert.match(pinPepperPolicies[0][0], /^SessionHandlerServiceRoleDefaultPolicy/);

  assert.equal(userPool.DeletionPolicy, 'Retain');
  assert.equal(userPool.UpdateReplacePolicy, 'Retain');
  assert.equal(userPool.Properties.UserPoolName, 'jumpyard-check-in-park-test-admin');
  assert.equal(userPool.Properties.UserPoolTier, 'ESSENTIALS');
  assert.equal(userPool.Properties.DeletionProtection, 'ACTIVE');
  assert.equal(userPool.Properties.AdminCreateUserConfig.AllowAdminCreateUserOnly, true);
  assert.deepEqual(userPool.Properties.UsernameAttributes, ['email']);
  assert.deepEqual(userPool.Properties.AutoVerifiedAttributes, ['email']);
  assert.equal(userPool.Properties.MfaConfiguration, 'ON');
  assert.deepEqual(userPool.Properties.EnabledMfas, ['SOFTWARE_TOKEN_MFA']);
  assert.deepEqual(userPool.Properties.UserPoolAddOns, { AdvancedSecurityMode: 'OFF' });
  assert.deepEqual(userPool.Properties.Policies.PasswordPolicy, {
    MinimumLength: 8,
    PasswordHistorySize: 5,
    RequireLowercase: true,
    RequireNumbers: true,
    RequireSymbols: false,
    RequireUppercase: true,
    TemporaryPasswordValidityDays: 7,
  });

  assert.equal(client.Properties.UserPoolId.Ref, userPoolId);
  assert.equal(client.Properties.GenerateSecret, false);
  assert.equal(client.Properties.EnableTokenRevocation, true);
  assert.equal(client.Properties.PreventUserExistenceErrors, 'ENABLED');
  assert.deepEqual(client.Properties.AllowedOAuthFlows, ['code']);
  assert.deepEqual(client.Properties.ExplicitAuthFlows, ['ALLOW_USER_SRP_AUTH']);
  assert.deepEqual(client.Properties.AllowedOAuthScopes, ['openid']);
  assert.deepEqual(client.Properties.CallbackURLs, [ADMIN_CALLBACK_URL]);
  assert.deepEqual(client.Properties.LogoutURLs, [ADMIN_LOGOUT_URL]);
  assert.equal(client.Properties.AccessTokenValidity, 60);
  assert.equal(client.Properties.IdTokenValidity, 60);
  assert.equal(client.Properties.RefreshTokenValidity, 480);
  assert.deepEqual(client.Properties.RefreshTokenRotation, {
    Feature: 'ENABLED',
    RetryGracePeriodSeconds: 10,
  });
  assert.deepEqual(client.Properties.SupportedIdentityProviders, ['COGNITO']);

  assert.equal(domain.Properties.Domain, ADMIN_DOMAIN_PREFIX);
  assert.equal(domain.Properties.ManagedLoginVersion, 2);
  assert.equal(domain.Properties.UserPoolId.Ref, userPoolId);

  assert.deepEqual(managedLoginBranding.Properties.ClientId, { Ref: clientId });
  assert.equal(managedLoginBranding.Properties.UseCognitoProvidedValues, false);
  assert.deepEqual(managedLoginBranding.Properties.UserPoolId, { Ref: userPoolId });
  assert.deepEqual(new Set(managedLoginBranding.DependsOn), new Set([clientId, domainId]));
  assert.deepEqual(managedLoginBranding.Properties.Settings.components.pageText.lightMode, {
    bodyColor: '000000ff',
    descriptionColor: '000000ff',
    headingColor: '000000ff',
  });
  assert.deepEqual(managedLoginBranding.Properties.Settings.components.primaryButton.lightMode.defaults, {
    backgroundColor: 'e31837ff',
    textColor: 'ffffffff',
  });
  assert.deepEqual(managedLoginBranding.Properties.Settings.components.primaryButton.lightMode.hover, {
    backgroundColor: 'b9102bff',
    textColor: 'ffffffff',
  });
  assert.equal(managedLoginBranding.Properties.Settings.componentClasses.inputLabel.lightMode.textColor, '000000ff');
  assert.equal(managedLoginBranding.Properties.Settings.componentClasses.inputDescription.lightMode.textColor, '000000ff');
  assert.equal(managedLoginBranding.Properties.Settings.componentClasses.focusState.lightMode.borderColor, 'e31837ff');
  assert.deepEqual(managedLoginBranding.Properties.Settings.categories.global, {
    colorSchemeMode: 'LIGHT',
    spacingDensity: 'REGULAR',
  });
  assert.equal(managedLoginBranding.Properties.Assets, undefined);
  assert.equal(managedLoginBranding.Properties.Settings.components.form.logo.enabled, false);

  assert.equal(authorizer.Properties.AuthorizerType, 'JWT');
  assert.deepEqual(authorizer.Properties.IdentitySource, ['$request.header.Authorization']);
  assert.deepEqual(authorizer.Properties.JwtConfiguration.Audience, [{ Ref: clientId }]);
  assert.deepEqual(authorizer.Properties.JwtConfiguration.Issuer['Fn::Join'][1], [
    'https://cognito-idp.eu-north-1.amazonaws.com/',
    { Ref: userPoolId },
  ]);

  const routes = routesByKey(template);
  assert.equal(routes.size, 26);
  const jwtRouteKeys = [
    'POST /v1/admin/auth/session',
    'GET /v1/admin/staff',
    'POST /v1/admin/staff',
    'PATCH /v1/admin/staff/{staffIdentityId}',
  ];
  assert.deepEqual(
    [...routes.entries()]
      .filter(([, { route }]) => route.Properties.AuthorizationType === 'JWT')
      .map(([routeKey]) => routeKey)
      .sort(),
    [...jwtRouteKeys].sort(),
  );
  for (const routeKey of jwtRouteKeys) {
    assert.deepEqual(routes.get(routeKey).route.Properties.AuthorizerId, { Ref: authorizerId });
  }

  for (const routeKey of [
    'POST /v1/staff/auth/login',
    'POST /v1/staff/auth/session',
    'GET /v1/staff/check-in/sessions',
    'GET /v1/staff/check-in/sessions/{checkinSessionId}',
    'POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem',
  ]) {
    assert.equal(routes.get(routeKey).route.Properties.AuthorizationType, 'NONE');
    assert.equal(routes.get(routeKey).route.Properties.AuthorizerId, undefined);
  }

  const sessionEnvironment = lambdaEnvironment(template, `${PARK_TEST_STACK_NAME}-session`);
  assert.equal(sessionEnvironment.STAFF_IDENTITY_MODE, 'pin');
  assert.equal(sessionEnvironment.ENABLE_STAFF_AUTH, 'true');
  assert.equal(sessionEnvironment.STAFF_IDENTITY_ENVIRONMENT, 'park-test');
  assert.equal(sessionEnvironment.STAFF_IDENTITY_VENUE_ID, '50871');
  assert.deepEqual(sessionEnvironment.STAFF_COGNITO_CLIENT_ID, { Ref: clientId });
  assert.deepEqual(sessionEnvironment.STAFF_PIN_PEPPER_SECRET_ARN, { Ref: pinPepperSecretId });
  assert.equal(sessionEnvironment.STAFF_AUTH_SECRET_ARN, undefined);

  const redeemEnvironment = lambdaEnvironment(template, `${PARK_TEST_STACK_NAME}-redeem`);
  assert.equal(redeemEnvironment.STAFF_IDENTITY_MODE, 'pin');
  assert.equal(redeemEnvironment.ENABLE_STAFF_AUTH, 'true');
  assert.equal(redeemEnvironment.STAFF_IDENTITY_ENVIRONMENT, 'park-test');
  assert.equal(redeemEnvironment.STAFF_IDENTITY_VENUE_ID, '50871');
  assert.equal(redeemEnvironment.STAFF_COGNITO_CLIENT_ID, undefined);
  assert.equal(redeemEnvironment.STAFF_PIN_PEPPER_SECRET_ARN, undefined);
  assert.equal(redeemEnvironment.STAFF_AUTH_SECRET_ARN, undefined);

  assert.deepEqual(
    ['AdminUserPoolId', 'AdminUserPoolClientId', 'AdminUserPoolDomain'].filter(
      (outputName) => template.Outputs[outputName],
    ),
    ['AdminUserPoolId', 'AdminUserPoolClientId', 'AdminUserPoolDomain'],
  );

  for (const forbiddenType of [
    'AWS::ApiGatewayV2::DomainName',
    'AWS::CloudFront::Distribution',
    'AWS::Cognito::IdentityPool',
    'AWS::WAFv2::WebACL',
  ]) {
    assert.equal(entriesOfType(template, forbiddenType).length, 0, `${forbiddenType} is outside T0194.`);
  }
}

function validateDev(template) {
  assert.equal(entriesOfType(template, 'AWS::Cognito::UserPool').length, 0);
  assert.equal(entriesOfType(template, 'AWS::Cognito::UserPoolClient').length, 0);
  assert.equal(entriesOfType(template, 'AWS::Cognito::UserPoolDomain').length, 0);
  assert.equal(entriesOfType(template, 'AWS::Cognito::ManagedLoginBranding').length, 0);
  assert.equal(entriesOfType(template, 'AWS::ApiGatewayV2::Authorizer').length, 0);

  const routes = routesByKey(template);
  assert.equal(routes.size, 21);
  assert.equal(routes.get('POST /v1/staff/auth/login').route.Properties.AuthorizationType, 'NONE');
  for (const routeKey of [
    'GET /v1/staff/check-in/sessions',
    'GET /v1/staff/check-in/sessions/{checkinSessionId}',
    'POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem',
  ]) {
    assert.equal(routes.get(routeKey).route.Properties.AuthorizationType, 'NONE');
  }

  for (const handlerName of ['session', 'redeem']) {
    const environment = lambdaEnvironment(template, `${DEV_STACK_NAME}-${handlerName}`);
    assert.equal(environment.STAFF_IDENTITY_MODE, 'legacy');
    assert.equal(environment.ENABLE_STAFF_AUTH, 'true');
    assert.equal(environment.STAFF_IDENTITY_ENVIRONMENT, 'dev');
    assert.ok(environment.STAFF_AUTH_SECRET_ARN);
    assert.equal(environment.STAFF_COGNITO_CLIENT_ID, undefined);
    assert.equal(environment.STAFF_IDENTITY_VENUE_ID, undefined);
  }
}

const parkTest = synthTemplate('./config/park-test-full-flow-rehearsal.json', PARK_TEST_STACK_NAME);
const dev = synthTemplate('./config/dev.json', DEV_STACK_NAME);
validateParkTest(parkTest);
validateDev(dev);

console.log('[pass] T0194 keeps exactly five park-test Cognito/JWT resources for admins and no dev identity resources');
console.log('[pass] T0194 enforces admin-only Cognito Essentials, TOTP, code flow, rotation, exact URLs, and JumpYard managed-login branding');
console.log('[pass] T0194 JWT-protects exactly four admin routes while PIN staff routes use Lambda proof');
console.log('[pass] T0194 repurposes the existing staff secret as a session-only PIN pepper and preserves dev legacy behavior');
