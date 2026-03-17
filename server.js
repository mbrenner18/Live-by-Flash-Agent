import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 8080;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Use process.cwd() as a backup, but __dirname is usually safer in ES modules
const distPath = path.resolve(__dirname, 'dist');

console.log(`--- Deployment Debug Info ---`);
console.log(`Working Dir: ${process.cwd()}`);
console.log(`Dist Path: ${distPath}`);

// 1. DIRECTORY VERIFICATION: This will print the contents of 'dist' to your Cloud Run logs
if (fs.existsSync(distPath)) {
  const contents = fs.readdirSync(distPath);
  console.log(`✅ Dist folder found. Contents: ${contents.join(', ')}`);
} else {
  console.error(`❌ CRITICAL: Dist folder NOT FOUND at ${distPath}`);
}

// 2. Serve static assets with long-term caching for hashed files
app.use(express.static(distPath, {
  immutable: true,
  maxAge: '1y',
  fallthrough: true 
}));

// 3. SPA Catch-all with Cache-Busting for index.html
app.get('*', (req, res) => {
  // If a request for a JS/CSS file reaches here, it definitely doesn't exist
  if (req.path.match(/\.(js|css|png|jpg|svg)$/)) {
    console.error(`Missing Asset: ${req.path}`);
    return res.status(404).send('Not Found');
  }

  const indexPath = path.join(distPath, 'index.html');
  
  if (fs.existsSync(indexPath)) {
    // CRITICAL: Prevent the browser from caching index.html so it always
    // looks for the newest JS/CSS hashes after a deployment.
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Site index not found');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
