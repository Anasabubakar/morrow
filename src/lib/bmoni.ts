import * as bmoniApi from './bmoniApi';
import { randomId } from './protocol';
import type { PaymentRequest, SettlementReceipt } from './types';

export interface BmoniAdapter {
  authenticate(): Promise<{ signedBy: string }>;
  settle(request: PaymentRequest): Promise<SettlementReceipt>;
}

/**
 * Deterministic local sandbox adapter. Never claims to move real funds —
 * this is the default so a fresh checkout runs without any BMONI setup.
 */
export class LocalBmoniSandbox implements BmoniAdapter {
  async authenticate() {
    await new Promise(resolve => setTimeout(resolve, 700));
    return { signedBy: 'demo-customer-key' };
  }

  async settle(request: PaymentRequest): Promise<SettlementReceipt> {
    await new Promise(resolve => setTimeout(resolve, 1250));
    return {
      id: randomId('rcpt'), requestId: request.id, status: 'settled',
      amountMinor: request.amountMinor, currency: request.currency,
      merchantName: request.merchant.name, customerName: 'Ada Nwosu',
      settledAt: Date.now(), reference: `MRW-${Date.now().toString(36).toUpperCase()}`,
    };
  }
}

function decimalAmount(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

async function pollProposalStatus(userId: string, smartWalletId: string, proposalId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const proposal = await bmoniApi.getProposal(userId, smartWalletId, proposalId);
    if (proposal.status === 'COMPLETED') return proposal;
    if (proposal.status === 'FAILED' || proposal.status === 'REJECTED') {
      throw new Error(`BMONI transfer ${proposal.status.toLowerCase()} (proposal ${proposalId}).`);
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw new Error(
    'Timed out waiting for BMONI to settle the transfer. If both accounts have not completed KYC, rail activation, and sandbox funding, the proposal will never complete — see docs/BMONI_INTEGRATION.md.'
  );
}

/**
 * Real BMONI sandbox adapter: creates/reuses a device wallet and BMONI user,
 * then runs the documented create-proposal -> approve -> sign-payload ->
 * sign -> submit -> poll lifecycle against embedded-dev.bmoni.com.
 *
 * Requires both the paying device's and the merchant's BMONI users to have
 * already completed KYC, rail activation, and sandbox funding — none of
 * which this adapter can do inline. See docs/BMONI_INTEGRATION.md.
 *
 * `bmoniSigner` wraps a native TurboModule that doesn't exist in Expo Go —
 * it and everything that imports it (`bmoniIdentity`) are loaded with a
 * dynamic `import()` here, and ONLY here, so that merely importing this
 * file (which every screen does, regardless of mode) never touches the
 * native module unless a live-mode method actually runs.
 */
export class RealBmoniAdapter implements BmoniAdapter {
  async authenticate() {
    const { ensureLocalBmoniIdentity } = await import('./bmoniIdentity');
    const identity = await ensureLocalBmoniIdentity(bmoniApi.stablecoinFor('NGN'));
    return { signedBy: identity.walletAddress };
  }

  async settle(request: PaymentRequest): Promise<SettlementReceipt> {
    const { ensureLocalBmoniIdentity, DEMO_PIN } = await import('./bmoniIdentity');
    const signer = await import('./bmoniSigner');

    const currency = bmoniApi.stablecoinFor(request.currency);
    const identity = await ensureLocalBmoniIdentity(currency);

    const { proposal } = await bmoniApi.createTransferProposal(identity.bmoniUserId, identity.smartWalletId, {
      toUserId: request.merchant.bmoniUserId,
      amount: decimalAmount(request.amountMinor),
      currency,
      description: request.note,
    });

    await bmoniApi.approveProposal(identity.bmoniUserId, identity.smartWalletId, proposal.proposalId);
    const { hashToSign } = await bmoniApi.getSignPayload(identity.bmoniUserId, identity.smartWalletId, proposal.proposalId);
    const signature = await signer.signTransactionHash(hashToSign, DEMO_PIN);
    await bmoniApi.submitSignature(identity.bmoniUserId, identity.smartWalletId, proposal.proposalId, signature);

    await pollProposalStatus(identity.bmoniUserId, identity.smartWalletId, proposal.proposalId);

    return {
      id: randomId('rcpt'),
      requestId: request.id,
      status: 'settled',
      amountMinor: request.amountMinor,
      currency: request.currency,
      merchantName: request.merchant.name,
      customerName: `Wallet ${identity.walletAddress.slice(0, 6)}…${identity.walletAddress.slice(-4)}`,
      settledAt: Date.now(),
      reference: proposal.proposalId,
    };
  }
}

export const bmoniAdapter: BmoniAdapter =
  process.env.EXPO_PUBLIC_BMONI_MODE === 'live' ? new RealBmoniAdapter() : new LocalBmoniSandbox();
