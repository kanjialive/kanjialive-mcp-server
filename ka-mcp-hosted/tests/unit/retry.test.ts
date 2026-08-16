import { describe, it, expect } from 'vitest';
import { AxiosError } from 'axios';
import {
  shouldRetry,
  getRetryDelay,
  calculateBackoffDelay,
} from '../../src/api/client.js';
import { MAX_BACKOFF, INITIAL_BACKOFF, MAX_RETRIES } from '../../src/api/constants.js';
import { httpError } from '../helpers.js';

describe('shouldRetry', () => {
  it('retries on rate limiting', () => {
    expect(shouldRetry(httpError(429))).toBe(true);
  });

  it('retries across the whole 5xx range', () => {
    for (const status of [500, 502, 503, 504, 599]) {
      expect(shouldRetry(httpError(status))).toBe(true);
    }
  });

  it('does not retry client errors that will never succeed', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(shouldRetry(httpError(status))).toBe(false);
    }
  });

  it('does not retry successful responses', () => {
    expect(shouldRetry(httpError(200))).toBe(false);
  });
});

describe('calculateBackoffDelay', () => {
  it('doubles the base delay on each attempt', () => {
    // Jitter adds 0-10%, so each attempt sits in [base, base * 1.1].
    const expectations: Array<[number, number]> = [
      [1, INITIAL_BACKOFF],
      [2, INITIAL_BACKOFF * 2],
      [3, INITIAL_BACKOFF * 4],
      [4, INITIAL_BACKOFF * 8],
    ];
    for (const [attempt, baseSeconds] of expectations) {
      const delay = calculateBackoffDelay(attempt);
      expect(delay).toBeGreaterThanOrEqual(baseSeconds * 1000);
      expect(delay).toBeLessThanOrEqual(baseSeconds * 1000 * 1.1);
    }
  });

  it('caps the base delay at MAX_BACKOFF however many attempts have passed', () => {
    for (const attempt of [10, 20, 50]) {
      const delay = calculateBackoffDelay(attempt);
      expect(delay).toBeGreaterThanOrEqual(MAX_BACKOFF * 1000);
      expect(delay).toBeLessThanOrEqual(MAX_BACKOFF * 1000 * 1.1);
    }
  });

  it('always returns a positive finite delay', () => {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const delay = calculateBackoffDelay(attempt);
      expect(Number.isFinite(delay)).toBe(true);
      expect(delay).toBeGreaterThan(0);
    }
  });
});

describe('getRetryDelay', () => {
  it('honours a numeric Retry-After header', () => {
    expect(getRetryDelay(httpError(429, { headers: { 'retry-after': '5' } }), 1)).toBe(5000);
    expect(getRetryDelay(httpError(429, { headers: { 'retry-after': '1' } }), 1)).toBe(1000);
  });

  it('caps an excessive Retry-After at MAX_BACKOFF', () => {
    // An unbounded Retry-After would let the upstream pin a worker for hours.
    expect(getRetryDelay(httpError(429, { headers: { 'retry-after': '3600' } }), 1)).toBe(MAX_BACKOFF * 1000);
    expect(getRetryDelay(httpError(429, { headers: { 'retry-after': '86400' } }), 1)).toBe(MAX_BACKOFF * 1000);
  });

  it('accepts a Retry-After exactly at the cap', () => {
    expect(getRetryDelay(httpError(429, { headers: { 'retry-after': String(MAX_BACKOFF) } }), 1)).toBe(
      MAX_BACKOFF * 1000
    );
  });

  it('honours Retry-After: 0 as an immediate retry', () => {
    // The header is parsed as delay-seconds, so 0 means retry now.
    expect(getRetryDelay(httpError(429, { headers: { 'retry-after': '0' } }), 1)).toBe(0);
  });

  it('falls back to exponential backoff for an HTTP-date Retry-After', () => {
    // The header may be a date; only the delay-seconds form is parsed.
    const delay = getRetryDelay(
      httpError(429, { headers: { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' } }),
      2
    );
    expect(delay).toBeGreaterThanOrEqual(INITIAL_BACKOFF * 2 * 1000);
    expect(delay).toBeLessThanOrEqual(INITIAL_BACKOFF * 2 * 1000 * 1.1);
  });

  it('falls back to backoff for a malformed or negative Retry-After', () => {
    for (const value of ['abc', '-5', '1.5', '']) {
      const delay = getRetryDelay(httpError(429, { headers: { 'retry-after': value } }), 1);
      expect(delay).toBeGreaterThanOrEqual(INITIAL_BACKOFF * 1000);
      expect(delay).toBeLessThanOrEqual(INITIAL_BACKOFF * 1000 * 1.1);
    }
  });

  it('uses backoff when there is no response at all', () => {
    const delay = getRetryDelay(new AxiosError('network down'), 1);
    expect(delay).toBeGreaterThanOrEqual(INITIAL_BACKOFF * 1000);
  });
});
