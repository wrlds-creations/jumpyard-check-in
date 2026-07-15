#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { GitHubDeploymentAccessStack } from '../lib/github-deployment-access-stack';

const app = new App();

new GitHubDeploymentAccessStack(app, 'jumpyard-check-in-park-test-github-deployment-access', {
  env: {
    account: '376129878018',
    region: 'eu-north-1',
  },
});
