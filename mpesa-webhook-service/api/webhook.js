const axios = require('axios');

// M-Pesa webhook handler for NexusPay
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Get backend URL from environment variable
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    
    console.log('🚀 M-Pesa Webhook Received:', {
      method: req.method,
      url: req.url,
      body: req.body,
      timestamp: new Date().toISOString()
    });

    // Route the webhook to the appropriate backend endpoint
    let backendEndpoint = '';
    
    if (req.url.includes('/stk-callback')) {
      backendEndpoint = '/api/mpesa/stk-callback';
    } else if (req.url.includes('/b2c-callback')) {
      backendEndpoint = '/api/mpesa/b2c-callback';
    } else if (req.url.includes('/queue-timeout')) {
      backendEndpoint = '/api/mpesa/queue-timeout';
    } else {
      // Default to main webhook endpoint
      backendEndpoint = '/api/mpesa/webhook';
    }

    const fullBackendUrl = `${backendUrl}${backendEndpoint}`;
    
    console.log('📡 Forwarding to backend:', fullBackendUrl);

    // Forward the webhook to your main backend
    const response = await axios.post(fullBackendUrl, req.body, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NexusPay-MPesa-Webhook/1.0',
        'X-Forwarded-From': 'vercel-webhook-service'
      },
      timeout: 25000 // 25 second timeout
    });

    console.log('✅ Backend response:', {
      status: response.status,
      data: response.data
    });

    // Return the backend response
    return res.status(response.status).json(response.data);

  } catch (error) {
    console.error('❌ Webhook forwarding error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      timestamp: new Date().toISOString()
    });

    // If backend is unreachable, store for retry (you can implement a queue later)
    const errorResponse = {
      success: false,
      message: 'Webhook forwarding failed',
      error: {
        code: 'WEBHOOK_FORWARDING_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    };

    // Return error response
    return res.status(500).json(errorResponse);
  }
};
