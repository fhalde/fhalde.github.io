import test from 'node:test';
import assert from 'node:assert/strict';
import { words, features, predict } from '../public/anonymity/model.mjs';

const authors = [
  { name: 'Red', snippets: ['red red blue'] },
  { name: 'Green', snippets: ['green green blue'] },
];

test('normalizes words, preserves Unicode and repeated features', () => {
  assert.deepEqual(words('CAFÉ, isn’t it? １２'), ['café', "isn't", 'it', '12']);
  assert.equal(features('red red').get('word:red'), 2);
  assert.equal(features('red red').get('pair:red red'), 1);
});

test('matches a hand-calculated add-one posterior with equal priors', () => {
  const { results } = predict(authors, 'red');
  assert.equal(results[0].name, 'Red');
  assert.ok(Math.abs(results[0].probability - 0.75) < 1e-12);
});

test('word pairs distinguish authors with identical unigram counts', () => {
  const { results, matchedPairs } = predict([
    { name: 'Forward', snippets: ['red blue'] },
    { name: 'Reverse', snippets: ['blue red'] },
  ], 'red blue');
  assert.equal(results[0].name, 'Forward');
  assert.equal(matchedPairs, 1);
  assert.ok(Math.abs(results[0].probability - 2 / 3) < 1e-12);
});

test('snippet boundaries do not create word pairs', () => {
  const output = predict([
    { name: 'Separate', snippets: ['red', 'blue'] },
    { name: 'Also separate', snippets: ['blue', 'red'] },
  ], 'red blue');
  assert.equal(output.matchedPairs, 0);
  assert.equal(output.results[0].probability, 0.5);
});

test('unknown features give no evidence and preserve equal author priors', () => {
  const output = predict([...authors, { name: 'Third', snippets: ['violet'] }], 'entirely unseen');
  assert.equal(output.matchedWords, 0);
  assert.ok(output.results.every(result => Math.abs(result.probability - 1 / 3) < 1e-12));
});

test('long samples yield finite normalized probabilities', () => {
  const output = predict(authors, 'red blue '.repeat(10000));
  assert.ok(output.results.every(result => Number.isFinite(result.probability)));
  assert.ok(Math.abs(output.results.reduce((sum, result) => sum + result.probability, 0) - 1) < 1e-12);
});

test('rejects missing training data, duplicate names, and empty samples', () => {
  assert.throws(() => predict(authors.slice(0, 1), 'red'), /two authors/);
  assert.throws(() => predict([{ name: '', snippets: ['red'] }, authors[1]], 'red'), /name/);
  assert.throws(() => predict([{ name: 'Red', snippets: ['...'] }, authors[1]], 'red'), /snippet/);
  assert.throws(() => predict([authors[0], { ...authors[1], name: 'red' }], 'red'), /different name/);
  assert.throws(() => predict(authors, '...'), /sample/);
});
