const axios = require('axios');

// M-Pesa STK Push callback handler
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    const fullBackendUrl = `${backendUrl}/api/mpesa/stk-callback`;
    
    console.log('📱 STK Callback received:', {
      body: req.body,
      timestamp: new Date().toISOString()
    });

    const response = await axios.post(fullBackendUrl, req.body, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NexusPay-STK-Callback/1.0'
      },
      timeout: 25000
    });

    console.log('✅ STK Callback forwarded successfully');
    return res.status(response.status).json(response.data);

  } catch (error) {
    console.error('❌ STK Callback forwarding failed:', error.message);
    return res.status(500).json({
      success: false,
      message: 'STK callback forwarding failed',
      error: error.message
    });
  }
};
