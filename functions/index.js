const path = require('path');
const { onRequest } = require('firebase-functions/v2/https');

process.chdir(path.join(__dirname, '..'));

const app = require('../server');

exports.api = onRequest(
  {
    region: 'europe-west1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  app
);
