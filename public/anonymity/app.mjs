import { predict } from './model.mjs';

const authors = document.getElementById('authors');
const results = document.getElementById('results');
const error = document.getElementById('error');
let nextId = 0;

function invalidate() {
  results.hidden = true;
  error.hidden = true;
}

function addSnippet(card, focus = true) {
  const id = `snippet-${++nextId}`;
  const snippet = document.createElement('div');
  snippet.className = 'snippet';
  snippet.innerHTML = `<div class="snippet-heading"><label for="${id}">Writing snippet</label><button type="button" aria-label="Remove writing snippet">Remove snippet</button></div><textarea id="${id}" rows="4" placeholder="Paste this author’s writing…" spellcheck="false"></textarea>`;
  snippet.querySelector('button').addEventListener('click', () => {
    snippet.remove();
    invalidate();
    card.querySelector('.add-snippet').focus();
  });
  card.querySelector('.snippets').appendChild(snippet);
  invalidate();
  if (focus) snippet.querySelector('textarea').focus();
}

function addAuthor(focus = true) {
  const id = `author-${++nextId}`;
  const card = document.createElement('div');
  card.className = 'author';
  card.innerHTML = `<div class="author-heading"><div class="author-name"><label for="${id}">Author name</label><input id="${id}" class="name" type="text" placeholder="Name or alias" autocomplete="off"></div><button type="button" class="remove-author">Remove author</button></div><div class="snippets"></div><button type="button" class="add-snippet">+ Add snippet</button>`;
  card.querySelector('.remove-author').addEventListener('click', () => {
    card.remove();
    invalidate();
    document.getElementById('add-author').focus();
  });
  card.querySelector('.add-snippet').addEventListener('click', () => addSnippet(card));
  authors.appendChild(card);
  addSnippet(card, false);
  if (focus) card.querySelector('input').focus();
}

document.getElementById('add-author').addEventListener('click', () => addAuthor());
authors.addEventListener('input', invalidate);
document.getElementById('sample').addEventListener('input', invalidate);
document.getElementById('prediction-form').addEventListener('submit', event => {
  event.preventDefault();
  invalidate();
  try {
    const training = [...authors.querySelectorAll('.author')].map(card => ({
      name: card.querySelector('.name').value,
      snippets: [...card.querySelectorAll('textarea')].map(input => input.value),
    }));
    const prediction = predict(training, document.getElementById('sample').value);
    const ranking = document.getElementById('ranking');
    ranking.replaceChildren();
    for (const result of prediction.results) {
      const row = document.createElement('div');
      row.className = 'result';
      const name = document.createElement('span');
      name.className = 'result-name';
      name.textContent = result.name;
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.setAttribute('aria-hidden', 'true');
      const fill = document.createElement('span');
      fill.style.width = `${result.probability * 100}%`;
      bar.appendChild(fill);
      const percentage = document.createElement('span');
      percentage.className = 'percentage';
      percentage.textContent = `${(result.probability * 100).toFixed(1)}%`;
      row.append(name, bar, percentage);
      ranking.appendChild(row);
    }
    const [first, second] = prediction.results;
    const tied = Math.abs(first.probability - second.probability) < 1e-10;
    document.getElementById('result-title').textContent = tied ? 'No clear favorite' : `Most likely: ${first.name}`;
    document.getElementById('evidence').textContent = prediction.matchedWords
      ? `${prediction.matchedWords} of ${prediction.sampleWords} sample words and ${prediction.matchedPairs} word pairs matched the training vocabulary.`
      : 'No vocabulary overlap. There is no evidence to favor an author; all remain equally likely.';
    results.hidden = false;
  } catch (cause) {
    error.textContent = cause.message;
    error.hidden = false;
  }
});

addAuthor(false);
addAuthor(false);
