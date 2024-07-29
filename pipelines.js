import express from "express";
import fs from "fs";
import path from "path";
import morgan from "morgan";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import opensearch from "./pipelines/opensearch.js";

const app = express();

const PORT = process.env.PORT || 3010;

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logDirectory = path.join(__dirname, 'pipelines');

// Ensure log directory exists and set permissions
try {
  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
    fs.chmodSync(logDirectory, 0o777);
  }

  const logPath = path.join(logDirectory, 'app.log');
  // Create the log file if it doesn't exist
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, '');
  }
  // Ensure the log file is writable
  fs.chmodSync(logPath, 0o666);

  // Create a write stream (in append mode)
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  // Setup morgan for logging
  app.use(morgan('combined', { stream: logStream }));
} catch (error) {
  console.error('Failed to set up logging:', error);
  process.exit(1);
}

app.disable('x-powered-by');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(opensearch);

app.listen(PORT, () => {
  console.log(`${process.argv[1]} listening on port ${PORT}`);
});
