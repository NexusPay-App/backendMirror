const { createForwarder } = require('../lib/forward');
// Result payloads alone cannot reliably distinguish B2B from B2C callbacks.
module.exports = (req, res) => {
  const endpoint = process.env.MPESA_DEFAULT_CALLBACK_ENDPOINT;
  if (!['stk-callback', 'b2c-callback', 'b2b-callback', 'queue-timeout', 'callback'].includes(endpoint)) {
    return res.status(503).json({ success: false, message: 'Use a dedicated callback URL or configure the default callback endpoint' });
  }
  return createForwarder(endpoint)(req, res);
};
