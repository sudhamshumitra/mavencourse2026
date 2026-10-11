// Imported first by every unit test: guarantees no test can reach the real Anthropic API.
// A dummy key stops the SDK looking for real credentials; the dead base URL makes any call fail fast,
// which is exactly the "model call failed" path the fallbacks are meant to handle.
process.env.ANTHROPIC_API_KEY = 'test-key-no-network';
process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:9';
process.env.GV_TODAY = '2026-10-11';
delete process.env.GV_FAIL_WORKER;
