const axios = require('axios');

// M-Pesa STK Push callback handler with enhanced concurrency and error handling
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Immediately respond to M-Pesa to prevent timeout
  try {
    res.status(200).json({ 
      success: true, 
      message: 'Callback received',
      timestamp: new Date().toISOString()
    });
  } catch (_) {}

  try {
    const backendUrl = process.env.BACKEND_URL;
    
    if (!backendUrl) {
      console.error('❌ BACKEND_URL environment variable not set');
      return;
    }

    const fullBackendUrl = `${backendUrl}/api/mpesa/stk-callback`;
    
    console.log('📱 STK Callback received:', {
      body: req.body,
      timestamp: new Date().toISOString(),
      requestId: Math.random().toString(36).substr(2, 9)
    });

    // Add retry logic for reliability
    let retries = 3;
    let lastError = null;

    while (retries > 0) {
      try {
        const response = await axios.post(fullBackendUrl, req.body, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'NexusPay-STK-Callback/2.0',
            'X-Webhook-Source': 'vercel-webhook-service',
            'X-Request-ID': Math.random().toString(36).substr(2, 9)
          },
          timeout: 30000 // 30 second timeout
        });

        console.log('✅ STK Callback forwarded successfully:', {
          status: response.status,
          data: response.data,
          timestamp: new Date().toISOString()
        });
        
        return; // Success, exit retry loop

      } catch (error) {
        lastError = error;
        retries--;
        
        console.error(`❌ STK Callback forwarding attempt failed (${3 - retries}/3):`, {
          error: error.message,
          status: error.response?.status,
          data: error.response?.data,
          timestamp: new Date().toISOString()
        });

        if (retries > 0) {
          // Wait before retry (exponential backoff)
          const waitTime = (3 - retries) * 1000;
          console.log(`⏳ Retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // All retries failed
    console.error('❌ STK Callback forwarding failed after all retries:', {
      error: lastError.message,
      timestamp: new Date().toISOString()
    });

    // Store failed callback for manual processing (you can implement a queue later)
    const failedCallback = {
      type: 'stk-callback',
      payload: req.body,
      error: lastError.message,
      timestamp: new Date().toISOString(),
      retries: 3
    };

    console.error('📋 Failed callback data for manual processing:', failedCallback);

  } catch (error) {
    console.error('❌ Unexpected error in STK callback handler:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
};
