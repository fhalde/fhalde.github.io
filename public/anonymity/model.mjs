// Multinomial Naive Bayes: equal author priors, add-one smoothing,
// and a joint vocabulary of words and adjacent word pairs.
export function words(text) {
  return text.normalize('NFKC').toLowerCase().replaceAll('’', "'")
    .match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) || [];
}

export function features(text) {
  const tokens = words(text);
  const counts = new Map();
  const add = key => counts.set(key, (counts.get(key) || 0) + 1);
  for (let i = 0; i < tokens.length; i++) {
    add(`word:${tokens[i]}`);
    if (i) add(`pair:${tokens[i - 1]} ${tokens[i]}`);
  }
  return counts;
}

export function predict(authors, sample) {
  if (authors.length < 2) throw new Error('Add at least two authors.');
  const vocabulary = new Set();
  const models = authors.map((author, index) => {
    const name = author.name.trim();
    if (!name) throw new Error(`Give author ${index + 1} a name.`);
    const counts = new Map();
    let total = 0;
    for (const snippet of author.snippets) {
      // Separate snippets never create artificial word pairs at their boundaries.
      for (const [feature, count] of features(snippet)) {
        vocabulary.add(feature);
        counts.set(feature, (counts.get(feature) || 0) + count);
        total += count;
      }
    }
    if (!total) throw new Error(`Paste at least one snippet for ${name}.`);
    return { name, counts, total, index };
  });
  if (new Set(models.map(model => model.name.toLowerCase())).size !== models.length) {
    throw new Error('Use a different name for each author.');
  }
  const query = features(sample);
  if (!query.size) throw new Error('Paste a sample with some words to classify.');
  const known = [...query].filter(([feature]) => vocabulary.has(feature));
  let matchedWords = 0, matchedPairs = 0;
  for (const [feature, count] of known) {
    if (feature.startsWith('word:')) matchedWords += count;
    else matchedPairs += count;
  }
  const scores = models.map(model => {
    let score = -Math.log(models.length);
    for (const [feature, count] of known) {
      score += count * Math.log(((model.counts.get(feature) || 0) + 1) / (model.total + vocabulary.size));
    }
    return { name: model.name, index: model.index, score };
  });
  // Log-space scores and softmax avoid underflow for long pasted samples.
  const max = Math.max(...scores.map(result => result.score));
  const sum = scores.reduce((total, result) => total + Math.exp(result.score - max), 0);
  const results = scores.map(result => ({
    name: result.name, index: result.index, probability: Math.exp(result.score - max) / sum,
  })).sort((a, b) => b.probability - a.probability);
  return { results, matchedWords, matchedPairs, sampleWords: words(sample).length, vocabularySize: vocabulary.size };
}
