export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const valid = value => typeof value === 'number' && Number.isFinite(value);
export const number = (value, digits = 2) => valid(value) ? value.toLocaleString('zh-CN', {minimumFractionDigits:digits,maximumFractionDigits:digits}) : '—';
export const percent = value => valid(value) ? `${value > 0 ? '+' : ''}${(value * 100).toFixed(2)}%` : '—';
export const money = value => !valid(value) ? '—' : Math.abs(value) >= 1e8 ? `${number(value / 1e8)} 亿` : Math.abs(value) >= 1e4 ? `${number(value / 1e4)} 万` : number(value);

export function chartSVG(series, labels, options = {}) {
  const all = series.flatMap(s => s.values).filter(valid);
  if (!all.length) return '<div class="empty">当前没有可绘制的数据</div>';
  const W = 840, H = 300, L = 68, R = 18, T = 22, B = 35;
  let min = Math.min(...all), max = Math.max(...all);
  const pad = (max - min || Math.max(Math.abs(max) * .02, 1)) * .18;
  min -= pad; max += pad;
  const x = i => L + (labels.length === 1 ? .5 : i / Math.max(labels.length - 1, 1)) * (W-L-R);
  const y = n => T + (max-n)/(max-min)*(H-T-B);
  const fmt = options.percent ? v => `${(v*100).toFixed(1)}%` : v => number(v, v > 100 ? 0 : 2);
  let grid = '';
  for (let i=0;i<5;i++) {
    const v = min+(max-min)*i/4, py=y(v);
    grid += `<line x1="${L}" y1="${py}" x2="${W-R}" y2="${py}" class="grid-line"/><text x="${L-12}" y="${py+4}" text-anchor="end">${fmt(v)}</text>`;
  }
  const ticks = [...new Set([0, Math.floor((labels.length-1)/3), Math.floor(2*(labels.length-1)/3),labels.length-1])];
  grid += ticks.map(i=>`<text x="${x(i)}" y="${H-8}" text-anchor="${i===0?'start':i===labels.length-1?'end':'middle'}">${escapeHTML(labels[i])}</text>`).join('');
  const colors = ['#0c8c83','#8293b1','#dfac4f'];
  const lines = series.map((s,k)=>{
    let connected = false;
    const d=s.values.map((v,i)=>{
      if (!valid(v)) {connected=false;return '';}
      const segment=`${connected?'L':'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
      connected=true;return segment;
    }).join(' ');
    const area = series.length===1 && s.values.every(valid) ? `<path d="${d} L${x(s.values.length-1)},${H-B} L${x(0)},${H-B} Z" fill="url(#area)"/>` : '';
    const points = s.values.length===1 ? `<circle cx="${x(0)}" cy="${y(s.values[0])}" r="4" fill="${colors[k%3]}"/>` : '';
    return `${area}<path d="${d}" fill="none" stroke="${colors[k%3]}" stroke-width="2.4" stroke-linejoin="round"/>${points}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHTML(series.map(s=>s.name).join('、'))}走势图"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#0c8c83" stop-opacity=".16"/><stop offset="100%" stop-color="#0c8c83" stop-opacity="0"/></linearGradient></defs>${grid}${lines}</svg><div class="legend">${series.map((s,i)=>`<span><i style="background:${colors[i%3]}"></i>${escapeHTML(s.name)}</span>`).join('')}</div>`;
}

// Escape all model text; emit only the formatting elements created here.
function inlineMarkdown(text) {
  const token = /(\x60([^\x60\n]+)\x60|\*\*(.+?)\*\*|__(.+?)__|\*([^*\n]+)\*|\[([^\]\n]+)\]\((https?:\/\/[^\s()]+)\))/gi;
  let html = '', end = 0;
  for (const m of text.matchAll(token)) {
    html += escapeHTML(text.slice(end, m.index));
    if (m[2] !== undefined) html += '<code>' + escapeHTML(m[2]) + '</code>';
    else if (m[3] !== undefined || m[4] !== undefined) html += '<strong>' + escapeHTML(m[3] ?? m[4]) + '</strong>';
    else if (m[5] !== undefined) html += '<em>' + escapeHTML(m[5]) + '</em>';
    else html += '<a target="_blank" rel="noopener noreferrer" href="' + escapeHTML(m[7]) + '">' + escapeHTML(m[6]) + '</a>';
    end = m.index + m[0].length;
  }
  return html + escapeHTML(text.slice(end));
}

function tableCells(line) {
  return line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
}

export function renderMarkdown(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let paragraph = [];
  function flush() {
    if (paragraph.length) output.push('<p>' + paragraph.map(inlineMarkdown).join('<br>') + '</p>');
    paragraph = [];
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const list = /^([-+*]|\d+\.)\s+(.+)$/.exec(line);
    if (!line) { flush(); continue; }
    if (/^\x60{3}/.test(line)) {
      flush();
      const code = [];
      while (++i < lines.length && !/^\s*\x60{3,}\s*$/.test(lines[i])) code.push(lines[i]);
      output.push('<pre><code>' + escapeHTML(code.join('\n')) + '</code></pre>');
    } else if (heading) {
      flush();
      const tag = 'h' + heading[1].length;
      output.push('<' + tag + '>' + inlineMarkdown(heading[2]) + '</' + tag + '>');
    } else if (line.includes('|') && lines[i+1]?.includes('|') && tableCells(lines[i+1]).every(cell => /^:?-{3,}:?$/.test(cell)) && tableCells(line).length === tableCells(lines[i+1]).length) {
      flush();
      const header = tableCells(line);
      const rows = [];
      i++;
      while (i+1 < lines.length && lines[i+1].includes('|')) {
        const cells = tableCells(lines[++i]);
        rows.push('<tr>' + header.map((_, n) => '<td>' + inlineMarkdown(cells[n] ?? '') + '</td>').join('') + '</tr>');
      }
      output.push('<div class="answer-table"><table><thead><tr>' + header.map(cell => '<th scope="col">' + inlineMarkdown(cell) + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>');
    } else if (list) {
      flush();
      const ordered = /^\d/.test(list[1]);
      const tag = ordered ? 'ol' : 'ul';
      const item = ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-+*]\s+(.+)$/;
      const items = [list[2]];
      while (i+1 < lines.length && item.test(lines[i+1])) items.push(item.exec(lines[++i])[1]);
      output.push('<' + tag + (ordered ? ' start="' + parseInt(list[1],10) + '"' : '') + '>' + items.map(s => '<li>' + inlineMarkdown(s) + '</li>').join('') + '</' + tag + '>');
    } else if (/^([-*_])\1{2,}$/.test(line)) {
      flush(); output.push('<hr>');
    } else if (/^>\s?/.test(line)) {
      flush(); output.push('<blockquote>' + inlineMarkdown(line.replace(/^>\s?/,'')) + '</blockquote>');
    } else paragraph.push(lines[i]);
  }
  flush();
  return output.join('');
}

export function reportText(snapshot, answers) {
  const mode = snapshot.mode === 'sample' ? '历史样例（真实快照，非实时）' : '在线获取数据';
  return `# ${snapshot.title}\n\n数据模式：${mode}\n导出时间：${new Date().toLocaleString('zh-CN')}\n\n## 查询条件\n\n\`\`\`json\n${JSON.stringify(snapshot.context,null,2)}\n\`\`\`\n\n## 分析数据与来源\n\n\`\`\`json\n${JSON.stringify(snapshot.result,null,2)}\n\`\`\`\n\n## 解读记录\n\n${answers.map(a=>`### ${a.kind==='live'?'DeepSeek 回答':'本地规则摘要（非 AI）'}\n\n${a.answer}\n\n依据：\n\`\`\`json\n${JSON.stringify(a.evidence,null,2)}\n\`\`\``).join('\n\n')}\n\n教学分析；历史回测不代表未来收益。财务数据须核对报告期和披露日期。\n`;
}
