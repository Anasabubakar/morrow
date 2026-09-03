#!/usr/bin/env node
// One-time sandbox KYC + Nigeria rail activation for a BMONI test persona.
// The app itself only wires the payment lifecycle (create user, provision
// wallet, transfer) — KYC submission has no in-app UI because it involves
// human review in production. This script drives the sandbox-only version
// of that step directly against BMONI's REST API.
//
// Field names below were confirmed by exercising the real sandbox API on
// 2026-09-03, not just transcribed from docs — several diverged from what
// BMONI's public docs describe (see docs/BMONI_INTEGRATION.md). This script
// gets you through address/personal-info/source-of-funds automatically, then
// stops at a wall it can't get past without more information from BMONI:
//
//   BVN doesn't go through PATCH /kyc at all — `{ identity: { bvn } }` and a
//   flat `{ bvn }` were both rejected as "should not exist". It belongs to
//   POST /v1/users/{userId}/kyc/documents/identification as multipart form
//   data (`type=bvn`, `documentNumber=<bvn>`), confirmed by testing without
//   a file ("At least one file (front) is required" — so BVN needs a
//   supporting image too, contradicting BMONI's docs, which describe NGN as
//   upload-free). But the actual multipart file field isn't named `front`:
//   sending one under that name got "Unexpected field - front". The real
//   field name wasn't found by guessing — ask developers@bkey.me, or inspect
//   a real request from BMONI's Flutter reference app
//   (`example/lib/main.dart` in the `bmoni-proxy-api` repo, referenced by
//   their docs but not fetchable from here).
//
// This script does not attempt document upload at all — it stops at
// `activate` and prints BMONI's real error so you can see exactly what's
// still missing once you've resolved the above.
//
// Usage:
//   node scripts/bmoni-setup.mjs setup <bmoniUserId> <bunch-dillon|samson-jabo>
//   node scripts/bmoni-setup.mjs status <bmoniUserId>
//   node scripts/bmoni-setup.mjs balance <bmoniUserId>
//
// Get <bmoniUserId> from the "Live mode: BMONI account" card on the app's
// Home tab after running it once with EXPO_PUBLIC_BMONI_MODE=live.

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // No .env file — fall back to whatever's already in the environment.
}

const BASE_URL = process.env.EXPO_PUBLIC_BMONI_BASE_URL ?? 'https://embedded-dev.bmoni.com';
const API_KEY = process.env.EXPO_PUBLIC_BMONI_API_KEY;

// Only the fields BMONI's docs publish for these personas, mapped onto the
// confirmed-real PATCH /kyc shape. dateOfBirth and the address are not part
// of the documented persona data (BMONI's docs say personas legitimately
// leave several fields blank) — the values below are a placeholder, not
// verified persona data, and exist only to get past the "missing" checklist
// far enough to see the real BVN/document error.
const PERSONAS = {
  'bunch-dillon': { bvn: '95888168924', phoneNumber: '+2348000000000' },
  'samson-jabo': { bvn: '22222222222', phoneNumber: '+2348000000001' },
};

const PLACEHOLDER_PROFILE = {
  address: { countryCode: 'NGA', state: 'Lagos', postalCode: '100001', streetLine1: '1 Test Street', city: 'Lagos' },
  personalInfo: { dateOfBirth: '1990-01-01' },
  sourceOfFunds: 'salary',
};

async function call(method, path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'x-api-key': API_KEY,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    console.error(`✗ ${method} ${path} → ${response.status}`);
    console.error(JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} failed with ${response.status}`);
  }
  console.log(`✓ ${method} ${path}`);
  return json;
}

async function setup(userId, personaKey) {
  const persona = PERSONAS[personaKey];
  if (!persona) {
    console.error(`Unknown persona "${personaKey}". Choices: ${Object.keys(PERSONAS).join(', ')}`);
    process.exit(1);
  }

  console.log(`Submitting KYC address/personal-info/source-of-funds for ${userId}...`);
  const result = await call('PATCH', `/v1/users/${userId}/kyc`, PLACEHOLDER_PROFILE);
  console.log('Saved:', result.saved, '\nStill missing per BMONI:', result.missing);

  console.log(`\nBVN (${persona.bvn}) is NOT submitted by this script — the correct field name for it is`);
  console.log('unresolved (see the comment at the top of this file). Attempting activation anyway to');
  console.log('surface the real error:');
  const activation = await call('POST', `/v1/users/${userId}/kyc/activate`, { sumsubLevelName: 'id-only' }).catch(
    () => null
  );
  if (activation) console.log(JSON.stringify(activation, null, 2));
}

async function status(userId) {
  const result = await call('GET', `/v1/users/${userId}/onboarding/status`);
  console.log(JSON.stringify(result, null, 2));
}

async function balance(userId) {
  const result = await call('GET', `/v1/users/${userId}/smart-wallets/account/balances`);
  console.log(JSON.stringify(result, null, 2));
}

function usage() {
  console.error('Usage:');
  console.error('  node scripts/bmoni-setup.mjs setup <bmoniUserId> <bunch-dillon|samson-jabo>');
  console.error('  node scripts/bmoni-setup.mjs status <bmoniUserId>');
  console.error('  node scripts/bmoni-setup.mjs balance <bmoniUserId>');
}

async function main() {
  const [command, userId, arg] = process.argv.slice(2);
  if (!command || !userId) {
    usage();
    process.exit(1);
  }

  if (!API_KEY) {
    console.error('EXPO_PUBLIC_BMONI_API_KEY is not set. Add it to .env first (see .env.example).');
    process.exit(1);
  }

  if (command === 'setup') return setup(userId, arg);
  if (command === 'status') return status(userId);
  if (command === 'balance') return balance(userId);
  usage();
  process.exit(1);
}

main().catch(() => process.exit(1));
