#!/usr/bin/env node
const {
  DEFAULT_SMOKE_PATH,
  RollerConfigError,
  createRollerClient,
  loadLocalEnv,
  readRollerConfig,
  validateRollerSmokeConfig,
} = require('./roller-client');

async function main() {
  loadLocalEnv();

  const config = readRollerConfig();
  const validation = validateRollerSmokeConfig(config);

  if (!validation.ok) {
    console.error('Roller smoke test blocked by configuration:');
    for (const error of validation.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  const endpointPath = process.env.ROLLER_SMOKE_PATH || DEFAULT_SMOKE_PATH;

  try {
    const client = createRollerClient();
    const result = await client.readSmokeResource(endpointPath);

    console.log('Roller smoke test passed.');
    console.log(`- env: ${client.config.env}`);
    console.log(`- baseUrl: ${client.config.baseUrl}`);
    console.log(`- readEndpoint: ${result.endpointPath}`);
    console.log(`- status: ${result.status}`);
    console.log(`- responseSummary: ${JSON.stringify(result.summary)}`);
  } catch (error) {
    if (error instanceof RollerConfigError) {
      console.error(`Roller smoke test blocked by configuration: ${error.message}`);
      process.exit(1);
    }

    console.error(`Roller smoke test failed: ${error.message}`);
    console.error('No secrets were printed. Token auth may have succeeded; confirm the read endpoint path and credential scope.');
    process.exit(1);
  }
}

main();
