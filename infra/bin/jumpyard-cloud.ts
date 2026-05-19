#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { loadJumpYardCloudConfig } from '../lib/config';
import { JumpYardCloudStack } from '../lib/jumpyard-cloud-stack';

const app = new App();
const config = loadJumpYardCloudConfig(app);

new JumpYardCloudStack(app, `${config.resourcePrefix}-stack`, {
  config,
  env: {
    account: config.awsAccount,
    region: config.awsRegion,
  },
});
