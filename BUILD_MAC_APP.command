#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "Building Dux Notes for Mac..."
npm config set registry https://registry.npmjs.org/
npm install
npm run build:mac
echo "Done. Opening release folder..."
open release
