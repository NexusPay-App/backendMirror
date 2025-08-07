const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Enable CORS for all routes
app.use(cors());

// Serve static files from the current directory
app.use(express.static(__dirname));

// Serve the main authentication page at the root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-google-auth.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'NexusPay Frontend Server is running',
        port: PORT,
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`🚀 NexusPay Frontend Server running on http://localhost:${PORT}`);
    console.log(`📱 Authentication Interface: http://localhost:${PORT}/`);
    console.log(`🔍 Health Check: http://localhost:${PORT}/health`);
});