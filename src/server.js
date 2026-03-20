import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;

// Log env status for debugging in Cloud Run logs
console.log('Backend API Key Status:', process.env.GEMINI_API_KEY ? 'DETECTED' : 'MISSING');

app.use(express.static(path.join(__dirname, 'dist')));

// SPA Fallback: Important for React Router
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
