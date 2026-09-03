import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { amount, pct, tiny, usd } from './format.js';

describe('tiny', () => {
  it('collapses leading zeros into a subscript count', () => {
    assert.equal(tiny(0.000004056546978), '0.0₅4056');
    assert.equal(tiny(1.8e-8), '0.0₇18');
  });
  it('leaves ordinary decimals alone', () => {
    assert.equal(tiny(0.0134), '0.0134');
    assert.equal(tiny(0), '0');
  });
});

describe('usd', () => {
  it('compacts big numbers and keeps cents on small ones', () => {
    assert.equal(usd(13_446_148.56), '$13.45M');
    assert.equal(usd(4056.55), '$4,056.55');
    assert.equal(usd(466_107.9), '$466.1k');
    assert.equal(usd(0.000004056), '$0.0₅4056');
    assert.equal(usd(undefined), '–');
  });
});

describe('amount and pct', () => {
  it('formats token amounts and signed percentages', () => {
    assert.equal(amount(1_000_000_000), '1.00B');
    assert.equal(amount('23314.94'), '23,315');
    assert.equal(amount(1.36243266), '1.3624');
    assert.equal(pct(3.07), '+3.07%');
    assert.equal(pct(-14.2), '-14.2%');
    assert.equal(pct(undefined), '–');
  });
});
