import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256, privateKeyToAddress, personalSign, recoverPersonalSignAddress } from '../src/crypto/evm-sign.js';

const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

test('keccak-256 matches the reference vectors', () => {
  assert.equal(hex(keccak256('')), 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  assert.equal(hex(keccak256('abc')), '4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45');
});

test('addresses and EIP-191 signatures match web3 reference values', async () => {
  assert.equal(privateKeyToAddress('0x' + '1'.padStart(64, '0')), '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf');
  const key = '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';
  assert.equal(privateKeyToAddress(key), '0x2c7536e3605d9c16a7a3d7b1898e529396a65c23');
  assert.equal(await personalSign(key, 'Some data'), '0xb91467e570a6466aa9e9876cbcd013baba02900b8979d43fe208a4a4f339f5fd6007e74cd82e037b800186422fc2da167c747ef045e5d18a5f5d4300f8e1a0291c');
});

test('every signature recovers its signer (recovery byte is right)', async () => {
  for (let i = 0; i < 8; i++) {
    const key = crypto.getRandomValues(new Uint8Array(32)); key[0] &= 0x7f; key[31] |= 1;
    const message = 'taskmarket:submit:0x' + hex(crypto.getRandomValues(new Uint8Array(32)));
    const sig = await personalSign(key, message);
    assert.equal(recoverPersonalSignAddress(message, sig), privateKeyToAddress(key));
  }
});
