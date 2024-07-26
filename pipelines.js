import express from "express";
import morgan from "morgan"; // Import morgan
import fs from 'fs';
import path from 'path';
import opensearch from "./pipelines/opensearch.js";

const app = express();
const PORT = process.env.PORT || 3010;

// Create a write stream (in append mode) for logging
const logStream = fs.createWriteStream(path.join(path.dirname(new URL(import.meta.url).pathname), 'app.log'), { flags: 'a' });

// Setup morgan to log requests to the console and to the file
app.use(morgan('combined', { stream: logStream }));
app.use(morgan('dev'));

app.disable('x-powered-by');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware for logging additional events
app.use((req, res, next) => {
  console.log(`Received a ${req.method} request for ${req.url}`);
  logStream.write(`Received a ${req.method} request for ${req.url}\n`);
  next();
});

app.use(opensearch);

app.listen(PORT, () => {
  const message = `${process.argv[1]} listening on port ${PORT}`;
  console.log(message);
  logStream.write(`${message}\n`);
});
