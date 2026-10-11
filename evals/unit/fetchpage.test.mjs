import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPage } from '../../api/_lib/fetchPage.js';

// Security: a user-pasted link must never make our server fetch internal addresses (SSRF).
// All of these are rejected before any request is sent, so the test needs no network.
const blocked = [
  'http://localhost/admin',
  'http://127.0.0.1/',
  'http://10.0.0.5/',
  'http://192.168.1.1/',
  'http://169.254.169.254/latest/meta-data/',
  'http://[::1]/',
  'http://[::ffff:127.0.0.1]/',
  'http://intranet.internal/',
  'http://printer.local/',
  'file:///etc/passwd',
  'ftp://example.org/',
  'http://example.org:8080/',
  'http://user:pass@example.org/',
  'not a url',
];

for (const url of blocked) {
  test(`blocks ${url}`, async () => {
    await assert.rejects(fetchPage(url), (err) => err.status === 400);
  });
}
