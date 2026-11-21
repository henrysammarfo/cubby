import {
  cashAddressToLockingBytecode,
  lockingBytecodeToCashAddress,
  publicKeyToP2pkhCashAddress,
  privateKeyToP2pkhCashAddress
} from '@bitauth/libauth';
import type { Network } from './network.js';

const asAddress = (result: { address: string } | string, context: string): string => {
  if (typeof result === 'string') throw new Error(`${context}: ${result}`);
  return result.address;
};

export const lockingToAddress = (lockingBytecode: Uint8Array, network: Network): string =>
  asAddress(lockingBytecodeToCashAddress({ bytecode: lockingBytecode, prefix: network.prefix }), 'address encode');

export const addressToLocking = (address: string): Uint8Array => {
  const decoded = cashAddressToLockingBytecode(address);
  if (typeof decoded === 'string') throw new Error(decoded);
  return decoded.bytecode;
};

export const addressPrefix = (address: string): string => {
  const decoded = cashAddressToLockingBytecode(address);
  if (typeof decoded === 'string') throw new Error(decoded);
  return decoded.prefix;
};

export const p2pkhAddressFromPublicKey = (publicKey: Uint8Array, network: Network): string =>
  asAddress(publicKeyToP2pkhCashAddress({ publicKey, prefix: network.prefix }), 'public key address');

export const p2pkhAddressFromPrivateKey = (privateKey: Uint8Array, network: Network): string =>
  asAddress(privateKeyToP2pkhCashAddress({ privateKey, prefix: network.prefix }), 'private key address');

export const assertNetworkAddress = (address: string, network: Network): void => {
  const prefix = addressPrefix(address);
  if (prefix !== network.prefix) {
    throw new Error(`This address is for a different network than the ${network.label}.`);
  }
};
