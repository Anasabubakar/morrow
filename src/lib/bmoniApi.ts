import type { Currency } from './types';

// Endpoints and field names below are transcribed from BMONI's public docs
// (https://bkey.mintlify.app) as of 2026-09-03. `createUser` and `submitKyc`
// have been exercised against the real sandbox and corrected to match; the
// wallet/transfer calls have not — treat those as best-effort and verify
// against the first real response before shipping. See
// docs/BMONI_INTEGRATION.md for what was actually confirmed.

const BASE_URL = process.env.EXPO_PUBLIC_BMONI_BASE_URL ?? 'https://embedded-dev.bmoni.com';
const API_KEY = process.env.EXPO_PUBLIC_BMONI_API_KEY;

// Smart-wallet and transfer calls take the stablecoin code, not the fiat one.
const STABLECOIN: Record<Currency, string> = { NGN: 'CNGN', USD: 'USDB' };

export function stablecoinFor(currency: Currency) {
  return STABLECOIN[currency];
}

export class BmoniApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = 'BmoniApiError';
  }
}

async function bmoniFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_KEY) {
    throw new Error(
      'EXPO_PUBLIC_BMONI_API_KEY is not set. Add it to a local .env file — see docs/BMONI_INTEGRATION.md.'
    );
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'x-api-key': API_KEY,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new BmoniApiError(`BMONI ${init?.method ?? 'GET'} ${path} failed with ${response.status}`, response.status, body);
  }
  return body as T;
}

export type SmartWallet = {
  address: string;
  chain: string;
  currency: string;
  status: string;
};

// Confirmed against the live sandbox: the docs describe this as an empty POST,
// but the real endpoint requires all four fields and nests the id under `user`.
export function createUser(input: { firstName: string; lastName: string; email: string; phoneNumber: string }) {
  return bmoniFetch<{ user: { bmoniUserId: string } }>('/v1/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// Confirmed against the live sandbox: PATCH /kyc takes a partial update of
// these top-level sections (each call can supply one or more). `address` and
// `personalInfo` field names below are confirmed; the shape for BVN/NIN
// submission is NOT — `{ identity: { bvn } }` and a flat `{ bvn }` were both
// rejected. Check `GET /v1/users/{userId}/kyc` after each PATCH to see what
// actually persisted, and confirm the identity field with developers@bkey.me
// before relying on it.
export type KycPatch = Partial<{
  address: { countryCode: string; state: string; postalCode: string; streetLine1: string; city?: string };
  personalInfo: { dateOfBirth: string };
  sourceOfFunds: string;
}>;

export function submitKyc(userId: string, patch: KycPatch) {
  return bmoniFetch<{ success: boolean; saved: Record<string, boolean>; canActivate: boolean; missing: string[] }>(
    `/v1/users/${userId}/kyc`,
    { method: 'PATCH', body: JSON.stringify(patch) }
  );
}

export function getKycProfile(userId: string) {
  return bmoniFetch<Record<string, unknown>>(`/v1/users/${userId}/kyc`);
}

// sumsubLevelName is required even for NGN, contradicting the docs' "empty
// body for CAD/NGN" claim. Confirmed valid options for this sandbox account:
// id-only | id-and-liveness | idv-and-phone-verification | bmoni-monerium.
// Activation additionally requires identification and proof-of-address
// document uploads before it will report `activated: true` — also
// contradicting the docs, which describe NGN as document-upload-free.
export function activateKyc(userId: string, sumsubLevelName: string) {
  return bmoniFetch<{ activated: boolean; message?: string }>(`/v1/users/${userId}/kyc/activate`, {
    method: 'POST',
    body: JSON.stringify({ sumsubLevelName }),
  });
}

export function createOwnerProofChallenge(userId: string, currency: string, userOwnerAddress: string) {
  return bmoniFetch<{ challengeId: string; eip191Message: string }>(
    `/v1/users/${userId}/smart-wallets/owner-proof-challenges`,
    { method: 'POST', body: JSON.stringify({ currency, userOwnerAddress }) }
  );
}

export function createManagedWallet(
  userId: string,
  currency: string,
  userOwnerAddress: string,
  ownerProofChallengeId: string,
  ownerProofSignature: string
) {
  return bmoniFetch<{ SmartWallet: SmartWallet }>(`/v1/users/${userId}/smart-wallets/create-managed`, {
    method: 'POST',
    body: JSON.stringify({ currency, userOwnerAddress, ownerProofChallengeId, ownerProofSignature }),
  });
}

export function getOnboardingStatus(userId: string) {
  return bmoniFetch<Record<string, unknown>>(`/v1/users/${userId}/onboarding/status`);
}

export function listWallets(userId: string) {
  return bmoniFetch<{ wallets: SmartWallet[] }>(`/v1/users/${userId}/smart-wallets/account/wallets`);
}

export function getBalances(userId: string) {
  return bmoniFetch<{ balances: Array<{ currency: string; amount: string }> }>(
    `/v1/users/${userId}/smart-wallets/account/balances`
  );
}

export type TransferProposal = {
  proposalId: string;
  status: string;
};

export function createTransferProposal(
  userId: string,
  smartWalletId: string,
  input: { toUserId: string; amount: string; currency: string; description?: string }
) {
  return bmoniFetch<{ proposal: TransferProposal }>(`/v1/users/${userId}/smart-wallets/${smartWalletId}/proposals`, {
    method: 'POST',
    body: JSON.stringify({ proposal: { type: 'TRANSFER', ...input } }),
  });
}

export function approveProposal(userId: string, smartWalletId: string, proposalId: string) {
  return bmoniFetch<{ status: string }>(
    `/v1/users/${userId}/smart-wallets/${smartWalletId}/proposals/${proposalId}/approve`,
    { method: 'POST' }
  );
}

export function getSignPayload(userId: string, smartWalletId: string, proposalId: string) {
  return bmoniFetch<{ hashToSign: string }>(
    `/v1/users/${userId}/smart-wallets/${smartWalletId}/proposals/${proposalId}/sign-payload`
  );
}

export function submitSignature(userId: string, smartWalletId: string, proposalId: string, signature: string) {
  return bmoniFetch<{ status: string }>(
    `/v1/users/${userId}/smart-wallets/${smartWalletId}/proposals/${proposalId}/sign`,
    { method: 'POST', body: JSON.stringify({ signature }) }
  );
}

export function getProposal(userId: string, smartWalletId: string, proposalId: string) {
  return bmoniFetch<TransferProposal>(`/v1/users/${userId}/smart-wallets/${smartWalletId}/proposals/${proposalId}`);
}
