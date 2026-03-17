import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs'; // Import fs to verify the directory

const app = express();
const PORT = process.env.PORT || 8080;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, 'dist'); // Use resolve for absolute pathing

// --- DEBUG LOGS ---
console.log('--- Server Startup Debug ---');
console.log(`Current __dirname: ${__dirname}`);
console.log(`Target distPath: ${distPath}`);

if (fs.existsSync(distPath)) {
  const files = fs.readdirSync(distPath);
  console.log(`✅ dist folder found. Contents: ${files.join(', ')}`);
  
  if (fs.existsSync(path.join(distPath, 'assets'))) {
     console.log(`✅ assets subfolder found: ${fs.readdirSync(path.join(distPath, 'assets')).slice(0, 3).join(', ')}...`);
  }
} else {
  console.error('❌ ERROR: dist folder NOT FOUND at startup!');
  console.log('Current directory contents:', fs.readdirSync(__dirname).join(', '));
}
// ------------------

// 1. Serve static assets
app.use(express.static(distPath));

// 2. SPA fallback
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('CRITICAL: index.html not found in dist!');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
