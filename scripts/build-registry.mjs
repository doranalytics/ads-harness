// Compiles the static registry — data/accounts.yml (the handle roster) and
// data/connectors.yml (the pipes and their status) — into
// lib/generated/registry.json. That is the ONLY thing the app boots with;
// every number comes from Supabase via app/api/data, or is absent.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');

const { accounts } = yaml.load(await fs.readFile(path.join(dataDir, 'accounts.yml'), 'utf8'));
const { connectors } = yaml.load(await fs.readFile(path.join(dataDir, 'connectors.yml'), 'utf8'));

const out = path.join(root, 'lib', 'generated');
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'registry.json'), JSON.stringify({ accounts, connectors }, null, 2) + '\n');
console.log(`registry.json: ${accounts.length} accounts, ${connectors.length} connectors`);
