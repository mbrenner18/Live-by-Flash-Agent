import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 8080;

// Use process.cwd() to ensure we're at the root of the deployed app
const root = process.cwd();
const distPath = path.resolve(root, 'dist');

console.log(`Server starting...`);
console.log(`Root directory: ${root}`);
console.log(`Looking for assets in: ${distPath}`);

// 1. Static Middleware (CRITICAL: Must be first)
// 'immutable' and 'maxAge' help Cloud Run/CDNs cache your hashed Vite assets
app.use(express.static(distPath, {
  immutable: true,
  maxAge: '1y',
  fallthrough: true // If file not found, continue to the catch-all
}));

// 2. SPA Catch-all
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  
  // Extra safety: If the browser is specifically asking for a .js file 
  // and we reached this point, the file is physically missing.
  if (req.path.endsWith('.js') || req.path.endsWith('.css')) {
    console.error(`Asset not found: ${req.path}`);
    return res.status(404).send('Asset not found');
  }

  res.sendFile(indexPath);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
