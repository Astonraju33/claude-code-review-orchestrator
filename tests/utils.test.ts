import { describe, it, expect } from 'vitest';
import { withRetry, withTimeout, ErrorCodes, ReviewError } from '../src/utils/error-handler.js';
import { RateLimiter } from '../src/utils/rate-limiter.js';

describe('withRetry', () => {
  it('returns the result when the first attempt succeeds', async () => {
    let calls = 0;
    const result = await withRetry(async () => { calls++; return 'ok'; }, 3, 1);
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries transient failures and then succeeds', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error('transient');
      return 'recovered';
    }, 3, 1);
    expect(result).toBe('recovered');
    expect(calls).toBe(3);
  });

  it('throws RETRY_EXHAUSTED after all attempts fail', async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw new Error('always'); }, 2, 1))
      .rejects.toMatchObject({ code: ErrorCodes.RETRY_EXHAUSTED });
    expect(calls).toBe(2);
  });
});

describe('withTimeout', () => {
  it('resolves when the operation finishes in time', async () => {
    const result = await withTimeout(async () => 'fast', 200);
    expect(result).toBe('fast');
  });

  it('rejects with AGENT_TIMEOUT when the operation is too slow', async () => {
    const slow = () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 300));
    const error = await withTimeout(slow, 20, 'too slow').catch((e) => e);
    expect(error).toBeInstanceOf(ReviewError);
    expect(error.code).toBe(ErrorCodes.AGENT_TIMEOUT);
    expect(error.message).toBe('too slow');
  });
});

describe('RateLimiter', () => {
  it('allows a request when nothing is in flight', () => {
    const limiter = new RateLimiter({ maxConcurrent: 1, maxRequestsPerMinute: 10, maxTokensPerMinute: 1000 });
    expect(limiter.canProceed(10)).toBe(true);
  });

  it('blocks when the concurrent limit is reached and frees on release', async () => {
    const limiter = new RateLimiter({ maxConcurrent: 1, maxRequestsPerMinute: 10, maxTokensPerMinute: 1000 });
    await limiter.acquire(10);
    expect(limiter.canProceed(10)).toBe(false);
    limiter.release();
    expect(limiter.canProceed(10)).toBe(true);
  });

  it('blocks when the requests-per-minute limit is reached', async () => {
    const limiter = new RateLimiter({ maxConcurrent: 5, maxRequestsPerMinute: 2, maxTokensPerMinute: 1000 });
    await limiter.acquire(1); limiter.release();
    await limiter.acquire(1); limiter.release();
    expect(limiter.canProceed(1)).toBe(false);
  });

  it('blocks when the tokens-per-minute limit would be exceeded', async () => {
    const limiter = new RateLimiter({ maxConcurrent: 5, maxRequestsPerMinute: 10, maxTokensPerMinute: 100 });
    await limiter.acquire(60); limiter.release();
    expect(limiter.canProceed(60)).toBe(false);
    expect(limiter.canProceed(30)).toBe(true);
  });
});
