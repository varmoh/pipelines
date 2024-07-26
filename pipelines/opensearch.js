import express from "express";
import multer from "multer";
import fs from "fs";
import os from "os";
import YAML from "yaml";
import sanitize from "string-sanitizer";
import { Client } from "@opensearch-project/opensearch";
import setRateLimit from "express-rate-limit";
import path from 'path';

const router = express.Router();
const upload = multer({ 
  dest: os.tmpdir()+'/',
  limits: { 
    fileSize: 50 * 1000 * 1000
  },
 });

const rateLimit = setRateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: "Too many requests",
  headers: true,
  statusCode: 429,
});

const sanitizeFilename = (filename) => {
  if(filename.includes('../')) {
    throw new Error('relative paths are not allowed')
  }
  return filename.replace('..', '');
}

const HOST = process.env.OPENSEARCH_HOST || "host.docker.internal";
const PORT = process.env.OPENSEARCH_PORT || "9200";
const PROTOCOL = process.env.OPENSEARCH_PROTOCOL || "https";
const AUTH = process.env.OPENSEARCH_AUTH || "admin:admin";

function os_open_client() {
  const client = new Client({
    node: `${PROTOCOL}://${AUTH}@${HOST}:${PORT}`,
    ssl: { rejectUnauthorized: false },
  });
  return client;
}

export async function osPut(index_name, document) {
  const client = os_open_client();

  const response = await client.index({
    index: index_name,
    id: document.id,
    body: document,
    refresh: true,
  });
  return response;
}

export async function osDeleteIndex(index_name) {
  const client = os_open_client();
  const response = await client.indices.delete({
    index: index_name,
  });
  return response;
}

export async function osDeleteObject(index_name, obj_id) {
  const client = os_open_client();
  await client.delete({
    index: index_name,
    id: obj_id,
  });
}

function getInput(req) {
  if (req.file) {
    const inp = req.file.destination + req.file.filename;
    return YAML.parse(fs.readFileSync(sanitizeFilename(inp), "utf8"));
  } else {
    return YAML.parse(req.body.input);
  }
}

// Create a write stream (in append mode) for logging
const logStream = fs.createWriteStream(path.join(path.dirname(new URL(import.meta.url).pathname), 'app.log'), { flags: 'a' });

const logRequest = (message) => {
  console.log(message);
  logStream.write(`${message}\n`);
};

/*
  For intents, one entity per file
*/
router.post("/put/:index_name/:index_type", upload.single("input"), rateLimit, (req, res) => {
  const input = getInput(req);

  logRequest(`Received PUT request for /put/${req.params.index_name}/${req.params.index_type} with input: ${JSON.stringify(input)}`);

  if (input.nlu) input = input.nlu;
  if (input.data) input = input.data;

  const index_name = req.params.index_name;
  const index_type = req.params.index_type;
  const obj = input[0];

  if (index_type) {
    obj.id = obj[index_type].replace(/\s+/g, "_");
  }

  osPut(index_name, obj)
    .then((ret) => {
      logRequest(`PUT request successful for /put/${index_name}/${index_type} with response: ${JSON.stringify(ret)}`);
      res.status(200).json(ret).end();
    })
    .catch((e) => {
      logRequest(`Error in PUT request for /put/${index_name}/${index_type}: ${e.message}`);
      res.status(500).json({ error: e.message }).end();
    });
});

/*
  For config and domain - many different types of entities in one list 
*/
router.post("/bulk/:index_name", upload.single("input"), rateLimit, (req, res) => {
  const input = getInput(req);

  logRequest(`Received BULK request for /bulk/${req.params.index_name} with input: ${JSON.stringify(input)}`);

  const index_name = req.params.index_name;

  for (let key in input) {
    if (key == "version") continue;
    const inp = {};
    inp[key] = input[key];
    inp.id = key;
    osPut(index_name, inp).catch(e => {
      logRequest(`Error in BULK request for /bulk/${index_name} key ${key}: ${e.message}`);
      console.error(e);
    });
  }
  res.end();
});

/*
  For rules, regexes, and stories with one type of entities in a list
*/
router.post("/bulk/:index_name/:index_type", upload.single("input"), rateLimit, (req, res) => {
  const input = getInput(req);

  logRequest(`Received BULK request for /bulk/${req.params.index_name}/${req.params.index_type} with input: ${JSON.stringify(input)}`);

  const index_name = req.params.index_name;
  const index_type = req.params.index_type;

  input[index_name].forEach((obj) => {
    obj.id = sanitize.sanitize.addDash(obj[index_type]);
    osPut(index_name, obj).catch((e) => {
      logRequest(`Error in BULK request for /bulk/${index_name}/${index_type}: ${e.message}`);
      res.status(500).end();
      console.error(e);
    });
  });
  res.status(200).end();
});

router.post("/delete/:index_name", (req, res) => {
  const index_name = req.params.index_name;

  logRequest(`Received DELETE request for /delete/${index_name}`);

  osDeleteIndex(index_name)
    .then((ret) => {
      logRequest(`DELETE request successful for /delete/${index_name} with response: ${JSON.stringify(ret)}`);
      res.status(200).json(ret).end();
    })
    .catch((e) => {
      logRequest(`Error in DELETE request for /delete/${index_name}: ${e.message}`);
      res.status(500).end();
      console.error(e);
    });
});

router.post("/delete/object/:index_name", (req, res) => {
  const index_name = req.params.index_name;
  const obj_id = req.body.id;

  logRequest(`Received DELETE request for /delete/object/${index_name} with obj_id: ${obj_id}`);

  osDeleteObject(index_name, obj_id)
    .then((ret) => {
      logRequest(`DELETE object request successful for /delete/object/${index_name} with response: ${JSON.stringify(ret)}`);
      res.status(200).json(ret).end();
    })
    .catch((e) => {
      logRequest(`Error in DELETE object request for /delete/object/${index_name}: ${e.message}`);
      res.status(500).end();
      console.error(e);
    });
});

router.post("/delete/:index_name/:obj_id", (req, res) => {
  const index_name = req.params.index_name;
  const obj_id = req.params.obj_id;

  logRequest(`Received DELETE request for /delete/${index_name}/${obj_id}`);

  osDeleteObject(index_name, obj_id)
    .then((ret) => {
      logRequest(`DELETE request successful for /delete/${index_name}/${obj_id} with response: ${JSON.stringify(ret)}`);
      res.status(200).json(ret).end();
    })
    .catch((e) => {
      logRequest(`Error in DELETE request for /delete/${index_name}/${obj_id}: ${e.message}`);
      res.status(500).end();
      console.error(e);
    });
});

export default router;
