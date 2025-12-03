#!/bin/bash
# Clean reinstall script for pnpm

echo "🧹 Cleaning up..."
rm -rf node_modules
rm -rf .next
rm -rf package-lock.json  # Remove if exists

echo "📦 Installing with pnpm..."
pnpm install

echo "✅ Installation complete!"

