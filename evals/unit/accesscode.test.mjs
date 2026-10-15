import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { accessCodeOk, accessCodeRequired } from '../../api/_lib/claude.js';

const req = (code) => ({ headers: code === undefined ? {} : { 'x-access-code': code } });

test('open when GV_ACCESS_CODE is unset', () => {
  delete process.env.GV_ACCESS_CODE;
  assert.equal(accessCodeRequired(), false);
  assert.equal(accessCodeOk(req()), true);
});

test('gated: only the exact code passes', () => {
  process.env.GV_ACCESS_CODE = 'test-code-123';
  try {
    assert.equal(accessCodeRequired(), true);
    assert.equal(accessCodeOk(req('test-code-123')), true);
    assert.equal(accessCodeOk(req()), false);
    assert.equal(accessCodeOk(req('')), false);
    assert.equal(accessCodeOk(req('test-code-12')), false);
    assert.equal(accessCodeOk(req('TEST-CODE-123')), false);
  } finally { delete process.env.GV_ACCESS_CODE; }
});
