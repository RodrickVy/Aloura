const { onRequest } = require('firebase-functions/v2/https');
const { handler }   = require('./build/handler.js');

exports.handler = onRequest({ timeoutSeconds: 60, memory: '512MiB' }, handler);
