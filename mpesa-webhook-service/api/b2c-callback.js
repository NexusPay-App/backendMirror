const axios = require('axios');

// M-Pesa B2C callback handler
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    const fullBackendUrl = `${backendUrl}/api/mpesa/b2c-callback`;
    
    console.log('💸 B2C Callback received:', {
      body: req.body,
      timestamp: new Date().toISOString()
    });

    const response = await axios.post(fullBackendUrl, req.body, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NexusPay-B2C-Callback/1.0'
      },
      timeout: 25000
    });

    console.log('✅ B2C Callback forwarded successfully');
    return res.status(response.status).json(response.data);

  } catch (error) {
    console.error('❌ B2C Callback forwarding failed:', error.message);
    return res.status(500).json({
      success: false,
      message: 'B2C callback forwarding failed',
      error: error.message
    });
  }
};
