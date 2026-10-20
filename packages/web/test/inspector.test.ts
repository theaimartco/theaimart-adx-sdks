/**
 * The inspector panel builds its markup by string concatenation from ad-response data, so
 * every interpolated value has to be HTML-escaped.
 *
 * Nothing that reaches the panel is attacker-controlled today (`source` is normalised to an
 * enum, `impId` is server-generated), so this is a guard against that changing quietly —
 * `?adx_debug=1` turns the panel on, and that is a query parameter anyone can put in a link.
 *
 * Runs against a minimal DOM stub so it stays dependency-free like the rest of the suite.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enableInspector, disableInspector, inspectorLog } from '../src/inspector.ts';

class FakeEl {
  innerHTML = '';
  attrs: Record<string, string> = {};
  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }
  querySelector(): null {
    return null;
  }
  remove(): void {}
}

function withFakeDom(run: (created: FakeEl[]) => void): void {
  const created: FakeEl[] = [];
  const g = globalThis as Record<string, unknown>;
  const hadDocument = 'document' in g;
  const previous = g.document;
  g.document = {
    createElement: (): FakeEl => {
      const el = new FakeEl();
      created.push(el);
      return el;
    },
    body: { appendChild: (el: FakeEl): FakeEl => el },
  };
  try {
    run(created);
  } finally {
    disableInspector();
    if (hadDocument) g.document = previous;
    else delete g.document;
  }
}

test('inspector escapes ad-supplied values instead of parsing them as markup', () => {
  withFakeDom((created) => {
    enableInspector();
    inspectorLog('<img src=x onerror="alert(1)">', undefined);

    const panel = created[0];
    assert.ok(panel, 'panel was created');
    assert.ok(
      !panel.innerHTML.includes('<img src=x'),
      'hostile markup reached the panel unescaped',
    );
    assert.ok(
      panel.innerHTML.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'),
      'value should appear escaped, not dropped',
    );
  });
});

test('inspector still renders ordinary entries', () => {
  withFakeDom((created) => {
    enableInspector();
    inspectorLog('taimads', undefined);
    assert.ok(created[0].innerHTML.includes('taimads'));
  });
});
