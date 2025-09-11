const axios = require('axios');

// M-Pesa webhook handler for NexusPay with enhanced concurrency and monitoring
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Immediately respond to prevent timeout (ack-only for MPesa)
  try {
    res.status(200).json({ 
      success: true, 
      message: 'Webhook received',
      timestamp: new Date().toISOString()
    });
  } catch (_) {}

  try {
    // Get backend URL from environment variable
    const backendUrl = process.env.BACKEND_URL;
    
    if (!backendUrl) {
      console.error('❌ BACKEND_URL environment variable not set');
      return;
    }
    
    const requestId = Math.random().toString(36).substr(2, 9);
    
    console.log('🚀 M-Pesa Webhook Received:', {
      method: req.method,
      url: req.url,
      body: req.body,
      timestamp: new Date().toISOString(),
      requestId
    });

    // Route the webhook to the appropriate backend endpoint
    let backendEndpoint = '';
    
    if (req.url.includes('/stk-callback')) {
      backendEndpoint = '/api/mpesa/stk-callback';
    } else if (req.url.includes('/b2c-callback')) {
      backendEndpoint = '/api/mpesa/b2c-callback';
    } else if (req.url.includes('/b2b-callback')) {
      backendEndpoint = '/api/mpesa/b2b-callback';
    } else if (req.url.includes('/queue-timeout')) {
      backendEndpoint = '/api/mpesa/queue-timeout';
    } else {
      // Default to main webhook endpoint
      backendEndpoint = '/api/mpesa/webhook';
    }

    const fullBackendUrl = `${backendUrl}${backendEndpoint}`;
    
    console.log('📡 Forwarding to backend:', {
      url: fullBackendUrl,
      requestId
    });

    // Add retry logic for reliability
    let retries = 3;
    let lastError = null;

    while (retries > 0) {
      try {
        // Forward the webhook to your main backend
        const response = await axios.post(fullBackendUrl, req.body, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'NexusPay-MPesa-Webhook/2.0',
            'X-Forwarded-From': 'vercel-webhook-service',
            'X-Request-ID': requestId,
            'X-Webhook-Timestamp': new Date().toISOString()
          },
          timeout: 30000 // 30 second timeout
        });

        console.log('✅ Backend response:', {
          status: response.status,
          data: response.data,
          requestId,
          timestamp: new Date().toISOString()
        });

        return; // Success, exit retry loop

      } catch (error) {
        lastError = error;
        retries--;
        
        console.error(`❌ Webhook forwarding attempt failed (${3 - retries}/3):`, {
          error: error.message,
          status: error.response?.status,
          data: error.response?.data,
          requestId,
          timestamp: new Date().toISOString()
        });

        if (retries > 0) {
          // Wait before retry (exponential backoff)
          const waitTime = (3 - retries) * 1000;
          console.log(`⏳ Retrying in ${waitTime}ms... (Request ID: ${requestId})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // All retries failed
    console.error('❌ Webhook forwarding failed after all retries:', {
      error: lastError.message,
      requestId,
      timestamp: new Date().toISOString()
    });

    // Store failed webhook for manual processing
    const failedWebhook = {
      type: 'webhook-forwarding',
      endpoint: backendEndpoint,
      payload: req.body,
      error: lastError.message,
      timestamp: new Date().toISOString(),
      requestId,
      retries: 3
    };

    console.error('📋 Failed webhook data for manual processing:', failedWebhook);

  } catch (error) {
    console.error('❌ Unexpected error in webhook handler:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
};
