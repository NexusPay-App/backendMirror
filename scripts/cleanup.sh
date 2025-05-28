#!/bin/bash

# Remove any .env files
find . -type f -name ".env*" ! -name ".env.example" -exec rm -f {} +

# Remove any private key files
find . -type f -name "*.pem" -o -name "*.key" -o -name "*.p12" -o -name "*.pfx" -exec rm -f {} +

# Remove any log files
find . -type f -name "*.log" -exec rm -f {} +

# Remove Redis dump files
find . -type f -name "dump.rdb" -exec rm -f {} +

# Remove any test files that might contain sensitive data
find . -type f -name "test-*.js" -o -name "*-test-*.js" -o -name "simulate-*.js" -o -name "*-simulation.js" -exec rm -f {} +

# Remove temporary files
find . -type f -name "*.tmp" -o -name "*.bak" -o -name "*.swp" -o -name "*.swo" -exec rm -f {} +

# Remove node_modules
rm -rf node_modules/

# Remove build artifacts
rm -rf dist/ build/

echo "Cleanup completed. Please review changes before committing." 