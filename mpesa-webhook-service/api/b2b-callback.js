const axios = require('axios');

// M-Pesa B2B callback handler
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const backendUrl = process.env.BACKEND_URL;
    
    if (!backendUrl) {
      console.error('❌ BACKEND_URL environment variable not set');
      return res.status(500).json({
        success: false,
        message: 'Webhook service not configured properly'
      });
    }
    const fullBackendUrl = `${backendUrl}/api/mpesa/b2b-callback`;
    
    console.log('💸 B2B Callback received:', {
      body: req.body,
      timestamp: new Date().toISOString()
    });

    const response = await axios.post(fullBackendUrl, req.body, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NexusPay-B2B-Callback/1.0'
      },
      timeout: 25000
    });

    console.log('✅ B2B Callback forwarded successfully');
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ B2B Callback forwarding failed:', error.message);
    return res.status(200).json({
      success: false,
      message: 'B2B callback forwarding failed',
      error: error.message
    });
  }
};
