const axios = require('axios');

// KPLC Token Message Webhook Handler
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

    const fullBackendUrl = `${backendUrl}/api/kplc/webhook/token`;
    
    console.log('⚡ KPLC Token Webhook received:', {
      body: req.body,
      timestamp: new Date().toISOString()
    });

    // Validate required fields
    const { accountNumber, tokenMessage, amount, phoneNumber } = req.body;
    
    if (!accountNumber || !tokenMessage || !amount) {
      console.error('❌ Missing required fields in KPLC token webhook');
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: accountNumber, tokenMessage, amount'
      });
    }

    const response = await axios.post(fullBackendUrl, req.body, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NexusPay-KPLC-Token/1.0'
      },
      timeout: 25000
    });

    console.log('✅ KPLC Token webhook forwarded successfully');
    return res.status(response.status).json(response.data);

  } catch (error) {
    console.error('❌ KPLC Token webhook forwarding failed:', error.message);
    return res.status(500).json({
      success: false,
      message: 'KPLC token webhook forwarding failed',
      error: error.message
    });
  }
};
