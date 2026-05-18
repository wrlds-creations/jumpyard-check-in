#!/usr/bin/env node
const {
  RollerConfigError,
  createRollerClient,
  readRollerConfig,
  validateRollerEnvironment,
} = require('./roller-client');

const config = readRollerConfig();
const validation = validateRollerEnvironment(config);

if (!validation.ok) {
  console.error('Roller environment check failed:');
  for (const error of validation.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

try {
  const client = createRollerClient();
  console.log('Roller environment check passed.');
  console.log(`- env: ${client.config.env}`);
  console.log(`- baseUrl: ${client.config.baseUrl}`);
  console.log(`- clientIdConfigured: ${client.config.hasClientId}`);
  console.log(`- clientSecretConfigured: ${client.config.hasClientSecret}`);

  for (const warning of validation.warnings) {
    console.warn(`WARN: ${warning}`);
  }
} catch (error) {
  if (error instanceof RollerConfigError) {
    console.error(`Roller environment check failed: ${error.message}`);
    process.exit(1);
  }

  throw error;
}
