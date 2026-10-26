import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { watchPaidAlternatives } from '../src/revenue/paid-work-watch.js';

test('the hourly watch stores a paid platform lead and skips a gift card', async () => {
  const db = sqliteD1();
  const fetchImpl = async (url) => {
    if (String(url).includes('/search/repositories')) {
      return { ok: true, json: async () => ({ items: [
        { full_name: 'opire/opire', html_url: 'https://github.com/opire/opire', description: 'Bounty payout API for open source' },
        { full_name: 'scam/cards', html_url: 'https://github.com/scam/cards', description: 'paid gift card payout' },
      ] }) };
    }
    return { ok: true, json: async () => ({ items: [] }) };
  };
  const installed = [];
  const asked = [];
  const result = await watchPaidAlternatives({ DB: db }, {
    fetchImpl,
    githubDiscovery: async () => ({ opportunities: [], errors: [] }),
    install: async (_env, url) => { installed.push(url); return { status: 'INSTALL_QUEUED' }; },
    askOwner: async (_db, lead) => { asked.push(lead.url); },
  });
  assert.equal(result.fresh, 1);
  assert.deepEqual(installed, ['https://github.com/opire/opire']);
  assert.deepEqual(asked, []);
  const row = await db.prepare('SELECT status, data FROM revenue_watch WHERE url=?').bind('https://github.com/opire/opire').first();
  assert.equal(row.status, 'DISCOVERY_ONLY');
  assert.match(row.data, /pas de remise/);
  assert.equal(await db.prepare('SELECT url FROM revenue_watch WHERE url=?').bind('https://github.com/scam/cards').first(), null);
});

test('a platform that needs an account is both built and asked', async () => {
  const db = sqliteD1();
  const asked = [];
  const fetchImpl = async () => ({ ok: true, json: async () => ({ items: [
    { full_name: 'algora/algora', html_url: 'https://github.com/algora/algora', description: 'Bounty payout API key account' },
  ] }) });
  await watchPaidAlternatives({ DB: db }, {
    fetchImpl,
    githubDiscovery: async () => ({ opportunities: [], errors: [] }),
    install: async () => ({ status: 'INSTALL_QUEUED' }),
    askOwner: async (_db, lead) => { asked.push(lead.url); },
  });
  assert.deepEqual(asked, ['https://github.com/algora/algora']);
});

