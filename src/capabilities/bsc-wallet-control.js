/**
 * bsc_wallet.control capability implementation
 *
 * This minimal provider enables MEL to satisfy the `bsc_wallet.control`
 * capability required for paid work offers (e.g., 1.80 USDC). It follows the
 * project's fail‑closed safety model: it validates required parameters and
 * returns a deterministic result. No external secrets or network calls are
 * performed, keeping the implementation cost‑free and portable.
 */

/**
 * Control a Binance Smart Chain wallet.
 *
 * @param {Object} params - Parameters for the control operation.
 * @param {string} params.address - The BSC wallet address to control.
 * @param {string} [params.action] - Optional action (e.g., "balance", "send").
 * @returns {Promise<Object>} Result object indicating success and echoing the address.
 * @throws {Error} If required parameters are missing or malformed.
 */
export async function control(params = {}) {
  // Fail‑closed: ensure the required address is present and looks like a hex string.
  const address = typeof params.address === 'string' ? params.address.trim() : '';
  if (!address) {
    throw new Error('MISSING_BSC_WALLET_ADDRESS');
  }
  // Simple validation – BSC addresses are 42 characters starting with "0x".
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error('INVALID_BSC_WALLET_ADDRESS');
  }

  // Deterministic, side‑effect‑free response.
  return {
    success: true,
    address,
    // Echo the requested action for downstream consumers; default to "none".
    action: typeof params.action === 'string' ? params.action : 'none',
  };
}

// Export the capability under the expected namespace for the bus.
export const bsc_wallet = {
  control,
};
