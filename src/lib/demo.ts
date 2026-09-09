import { clearHistory } from './history';
import { clearProcessed } from './replay';
import { clearRedemptionGuard, clearReserve } from './reserve';
import { resetBalance } from './wallet';

/**
 * Full local reset for repeatable demo/rehearsal runs — balance, Reserve,
 * receipt history, and both replay guards. Deliberately does not touch the
 * device keypair (morrow.device-key.v1): the device's identity should stay
 * stable across resets, only its transaction state resets.
 */
export async function resetDemoState() {
  await Promise.all([resetBalance(), clearReserve(), clearRedemptionGuard(), clearHistory(), clearProcessed()]);
}
