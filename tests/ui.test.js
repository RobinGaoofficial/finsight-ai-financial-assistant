import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

const path = new URL('../static/ui.js', import.meta.url);
test('DeepSeek financial answer formats in chat and retains Markdown on export', async () => {
  const {renderMarkdown, reportText} = await import(path.href);
  const original = '这是**区间统计** [D1]。\n\n## 依据\n\n| 项目 | 数值 |\n|---|---|\n| 区间涨幅 | +15.67% [D1] |';
  const html = renderMarkdown(original);
  assert.match(html, /<strong>区间统计<\/strong>/);
  assert.match(html, /<h2>依据<\/h2>/);
  assert.match(html, /<th[^>]*>项目<\/th>/);
  assert.match(html, /<td[^>]*>\+15\.67% \[D1\]<\/td>/);
  assert.ok(reportText({title:'研究',mode:'sample',context:{},result:{}}, [{kind:'live',answer:original,evidence:[]}]).includes(original));
  assert.ok(!renderMarkdown('**<img src=x onerror=alert(1)>**').includes('<img'));
});
test('UI helpers exist', () => assert.ok(existsSync(path), 'UI helpers not implemented'));
if (existsSync(path)) {
  const {number, percent, money, escapeHTML, chartSVG, reportText} = await import(path.href);
  test('missing financial numbers remain missing rather than zero', () => {
    assert.equal(number(null), '—');
    assert.equal(percent(undefined), '—');
    assert.equal(money(NaN), '—');
    assert.equal(number(0), '0.00');
    assert.equal(percent(.125), '+12.50%');
  });
  test('untrusted labels cannot inject markup into chart', () => {
    assert.equal(escapeHTML('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
    const svg = chartSVG([{name:'<script>alert(1)</script>', values:[1,2]}], ['a','b']);
    assert.ok(!svg.includes('<script>'));
    assert.ok(svg.includes('&lt;script&gt;'));
  });
  test('flat and singleton data produce finite chart coordinates', () => {
    for (const values of [[1,1,1], [0], [-1,-1]]) {
      const svg = chartSVG([{name:'value',values}],values.map(String));
      assert.ok(!/NaN|Infinity/.test(svg));
      assert.ok(svg.includes('<svg'));
    }
    assert.ok(!chartSVG([{name:'x',values:[]}],[]).includes('<path'));
  });
  test('export preserves mode and evidence instead of dropping provenance', () => {
    const text = reportText({title:'测试报告',mode:'sample',context:{start:'2024-01-01'},result:{source:{name:'腾讯',fetched_at:'2026-11-02'}}}, []);
    assert.ok(text.includes('历史样例'));
    assert.ok(text.includes('2026-11-02'));
    assert.ok(text.includes('腾讯'));
  });
}
