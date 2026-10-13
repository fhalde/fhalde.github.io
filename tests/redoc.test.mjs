import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function page(renderer = (_spec, _options, _mount, done) => done()) {
  function element() {
    return {
      value: '', style: {}, textContent: '', hidden: false, children: [], disabled: false,
      addEventListener() {}, focus() {}, setAttribute() {},
      appendChild(child) { this.children.push(child); },
      replaceChildren(...children) { this.children = children; },
    };
  }
  const elements = new Map();
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element, querySelector: () => ({ offsetHeight: 42 }),
  };
  const Redoc = { init: renderer };
  const context = vm.createContext({ document, window: { Redoc }, Redoc, clearTimeout, setTimeout });
  const html = fs.readFileSync(new URL('../public/redoc/index.html', import.meta.url), 'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  return { context, document };
}
const api = { openapi: '3.0.3', info: { title: 'Test', version: '1' }, paths: {} };
const crd = {
  kind: 'CustomResourceDefinition', apiVersion: 'apiextensions.k8s.io/v1', metadata: { name: 'tests.example.com' },
  spec: { group: 'example.com', names: { kind: 'Test', plural: 'tests' }, scope: 'Namespaced',
    versions: [{ name: 'v1', served: true, schema: { openAPIV3Schema: { type: 'object', properties: { spec: { type: 'object' } } } } }],
  },
};

test('accepts complete specs, schemas, fenced JSON, and Kubernetes Lists', () => {
  const { context } = page();
  for (const document of [api, crd, { properties: { name: { type: 'string' } } }, { openAPIV3Schema: { type: 'object' } }]) {
    assert.equal(context.parseInput(JSON.stringify(document)).entries.length, 1);
  }
  assert.equal(context.parseInput('```json\n' + JSON.stringify(api) + '\n```').entries.length, 1);
  const bundle = context.parseInput(JSON.stringify({ kind: 'List', items: [api, crd, { kind: 'Service', apiVersion: 'v1' }] }));
  assert.equal(bundle.entries.length, 2);
  assert.equal(bundle.skipped, 1);
});

test('generates namespaced CRD paths, handles legacy schemas, and explains missing schemas', () => {
  const { context } = page();
  assert.ok(context.crdToOpenAPI(crd).paths['/v1/namespaces/{namespace}/tests']);
  const legacy = structuredClone(crd);
  legacy.spec.version = 'v1';
  legacy.spec.validation = legacy.spec.versions[0].schema;
  delete legacy.spec.versions;
  assert.ok(context.crdToOpenAPI(legacy).paths['/v1/namespaces/{namespace}/tests']);
  const incomplete = structuredClone(crd);
  delete incomplete.spec.versions[0].schema;
  assert.throws(() => context.crdToOpenAPI(incomplete), /no OpenAPI schema/);
});

test('render failures preserve pasted text and release the Generate button', async () => {
  const { context, document } = page((_spec, _options, _mount, done) => done(new Error('bad reference')));
  document.getElementById('crd-input').value = JSON.stringify(api);
  await context.generate();
  assert.match(document.getElementById('error-box').textContent, /bad reference/);
  assert.equal(document.getElementById('input-view').style.display, 'flex');
  assert.equal(document.getElementById('crd-input').value, JSON.stringify(api));
  assert.equal(document.getElementById('generate-btn').disabled, false);
});

test('one failed document does not block the rest of a bundle', async () => {
  const { context, document } = page();
  const incomplete = structuredClone(crd);
  delete incomplete.spec.versions[0].schema;
  document.getElementById('crd-input').value = JSON.stringify([incomplete, api]);
  await context.generate();
  assert.equal(document.getElementById('document-select').hidden, false);
  assert.equal(document.getElementById('redoc-view').style.display, 'block');
  assert.match(document.getElementById('redoc-container').children[0].textContent, /no OpenAPI schema/);
  await context.renderDocument(1);
  assert.equal(document.getElementById('toolbar-title').textContent, 'Test');
});

test('a late renderer error cannot reopen the view after Back', async () => {
  let complete;
  const { context, document } = page((_spec, _options, _mount, done) => { complete = done; });
  document.getElementById('crd-input').value = JSON.stringify(api);
  const rendering = context.generate();
  await Promise.resolve();
  context.goBack();
  complete(new Error('late error'));
  await rendering;
  assert.equal(document.getElementById('redoc-view').style.display, 'none');
  assert.equal(document.getElementById('generate-btn').disabled, false);
  assert.notEqual(document.getElementById('error-box').style.display, 'block');
});
