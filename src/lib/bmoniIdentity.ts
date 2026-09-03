import AsyncStorage from '@react-native-async-storage/async-storage';

import * as bmoniApi from './bmoniApi';
import * as signer from './bmoniSigner';

const STORAGE_KEY = 'morrow.bmoni-identity.v1';

// A device PIN gates every signing call. A production app must collect this
// from the user rather than using a fixed value — this constant only exists
// to keep the demo runnable before a full PIN entry flow is wired up.
export const DEMO_PIN = '123456';

export type BmoniIdentity = {
  bmoniUserId: string;
  walletAddress: string;
  // Assumed equal to walletAddress — BMONI's docs describe smart-wallet
  // calls by `smartWalletId` but the create-managed response only
  // documents `address`/`chain`/`currency`/`status`, not a distinct id.
  // Verify against a real create-managed response before relying on this.
  smartWalletId: string;
  currency: string;
};

let cached: BmoniIdentity | null = null;

/**
 * Ensures this device has a BMONI user, a device-bound wallet, and an
 * activated smart wallet for `currency`, creating whichever pieces are
 * missing. Idempotent and cached both in memory and in AsyncStorage.
 *
 * Does not run KYC or rail activation — those require document uploads and
 * human review and cannot happen inline. See docs/BMONI_INTEGRATION.md.
 */
export async function ensureLocalBmoniIdentity(currency: string): Promise<BmoniIdentity> {
  if (cached && cached.currency === currency) return cached;

  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored) as BmoniIdentity;
    if (parsed.currency === currency) {
      cached = parsed;
      return parsed;
    }
  }

  const walletAddress = await signer.ensureWallet();
  await signer.ensurePin(DEMO_PIN);
  // BMONI's account-registration fields (name/email/phone) are distinct from
  // the KYC persona submitted later by scripts/bmoni-setup.mjs — this is just
  // a unique-per-device placeholder since Morrow has no sign-up screen.
  const deviceTag = walletAddress.slice(2, 9).toLowerCase();
  const phoneDigits = walletAddress
    .slice(2, 12)
    .toLowerCase()
    .replace(/[a-f]/g, letter => String(letter.charCodeAt(0) % 10));
  const { user } = await bmoniApi.createUser({
    firstName: 'Morrow',
    lastName: 'Device',
    email: `device-${deviceTag}@morrow.app`,
    phoneNumber: `+234${phoneDigits}`,
  });
  const bmoniUserId = user.bmoniUserId;

  const challenge = await bmoniApi.createOwnerProofChallenge(bmoniUserId, currency, walletAddress);
  const signature = await signer.signMessage(challenge.eip191Message, DEMO_PIN);
  const { SmartWallet } = await bmoniApi.createManagedWallet(
    bmoniUserId,
    currency,
    walletAddress,
    challenge.challengeId,
    signature
  );

  const identity: BmoniIdentity = {
    bmoniUserId,
    walletAddress,
    smartWalletId: SmartWallet.address,
    currency,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  cached = identity;
  return identity;
}
