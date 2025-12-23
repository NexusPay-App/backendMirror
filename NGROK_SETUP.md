
# ============================================
# NGROK SETUP INSTRUCTIONS
# ============================================
# 1. Start ngrok in a separate terminal:
#    ngrok http 8000
#
# 2. Copy the HTTPS URL (e.g., https://xxxx-xx-xx-xx-xx.ngrok-free.app)
#
# 3. Update the following in .env:
#    MPESA_STK_CALLBACK_URL=https://YOUR-NGROK-URL/api/mpesa/stk-callback
#    MPESA_B2C_RESULT_URL=https://YOUR-NGROK-URL/api/mpesa/b2c-callback
#    MPESA_B2C_TIMEOUT_URL=https://YOUR-NGROK-URL/api/mpesa/queue-timeout
#
# 4. Also update Vercel webhook BACKEND_URL to point to your ngrok URL
# ============================================

