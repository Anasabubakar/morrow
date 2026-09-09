export type Currency = 'NGN' | 'USD';

export type PaymentRequest = {
  version: 1;
  type: 'payment.request';
  id: string;
  merchant: { id: string; name: string; account: string; bmoniUserId: string };
  amountMinor: number;
  currency: Currency;
  note: string;
  nonce: string;
  createdAt: number;
  expiresAt: number;
  checksum: string;
};

export type SettlementReceipt = {
  id: string;
  requestId: string;
  status: 'settled' | 'pending';
  direction: 'sent' | 'received';
  amountMinor: number;
  currency: Currency;
  merchantName: string;
  customerName: string;
  settledAt: number;
  reference: string;
};

// Sent back from payer to merchant after a payment settles (either the
// BMONI-simulated path or Morrow Reserve), so the merchant's device has
// something concrete to verify and credit its own local balance against.
export type PaymentConfirmation = {
  version: 1;
  type: 'payment.confirmation';
  requestId: string;
  amountMinor: number;
  currency: Currency;
  payerLabel: string;
  settlementReference: string;
  confirmedAt: number;
  nonce: string;
  signerPublicKey: string;
  signature: string;
  // Present only for Reserve-funded payments. Self-authenticating (carries
  // its own signature over its own fields), so it is transported here
  // unsigned by the outer confirmation and independently verified by the
  // receiver — see verifyPaymentConfirmation in confirmation.ts.
  offlineAuthorization?: OfflineAuthorization;
};

// Morrow Reserve: pre-authorized offline spending power. Provisioned while
// online, spent while offline via signed authorizations, redeemed when
// connectivity returns. See docs/RESERVE.md.
export type ReserveAllowance = {
  version: 1;
  allowanceId: string;
  currency: Currency;
  valueMinor: number;
  issuerPublicKey: string; // base64 Ed25519 public key, device-generated
  expiresAt: number;
  createdAt: number;
  issuerSignature: string; // base64 Ed25519 signature over the fields above
};

export type ReserveState = {
  allowance: ReserveAllowance;
  spentMinor: number;
  counter: number;
  lastStateHash: string;
};

export type OfflineAuthorization = {
  version: 1;
  type: 'reserve.authorization';
  allowanceId: string;
  sequence: number;
  recipientRequestId: string; // binds this authorization to one specific PaymentRequest.id
  recipientName: string;
  amountMinor: number;
  currency: Currency;
  remainingMinor: number;
  previousStateHash: string;
  nonce: string;
  timestamp: number;
  issuerPublicKey: string;
  signature: string;
};

export type OpticalFrame = {
  v: 1;
  sessionId: number;
  seq: number;
  k: number;
  blockLen: number;
  totalLen: number;
  payload: string;
  checksum: string;
};
