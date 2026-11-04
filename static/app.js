import {escapeHTML as esc, number, percent, money, chartSVG, reportText, renderMarkdown} from './ui.js';

const $ = selector => document.querySelector(selector);
const area = $('#work-area');
const welcomeHTML = $('#conversation').innerHTML;
const names = {'600519':'贵州茅台','000858':'五粮液','600036':'招商银行'};
const tabs = {overview:['市场概览','让数据，成为判断的依据。','观察市场、比较企业，与 AI 一起理解数字背后的含义。'],compare:['企业对比','把企业，放在同一把尺上。','对齐报告期与指标口径，理解企业经营表现的异同。'],backtest:['策略实验','用历史，检验一个想法。','从一条简单规则开始，观察收益、成本与风险如何变化。'],sources:['数据与依据','每个结论，都有来处。','核对数据来源、报告期间和计算规则，让分析可以追溯。']};
const state = {tab:'overview',other:'000858',period:'2024-12-31',busy:0,answers:[],messages:[],results:{},status:{},parameters:{short:5,long:20,capital:100000,fee_bps:3,slippage_bps:5}};

function context() {
  return {symbol:$('#symbol').value.trim(),other:state.other,period:state.period,mode:$('#mode').value,start:$('#start').value,end:$('#end').value,...state.parameters};
}
function setBusy(delta) {
  state.busy += delta;
  document.querySelectorAll('.filters input,.filters select,.filters button,.nav-item,[data-company],.inline-controls input,.inline-controls select,.inline-controls button,.parameter-grid input,#run-backtest,#send,#demo,#export,[data-year],.prompt').forEach(el=>el.disabled=state.busy>0);
  $('#send').textContent=state.busy?'…':'↑';
}
function notice(message='') {$('#notice').textContent=message;$('#notice').hidden=!message;}
async function api(path,body) {
  const abort = new AbortController();
  const timer = setTimeout(()=>abort.abort(),path==='/api/chat'?250000:90000);
  try {
    const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:abort.signal});
    const result=await response.json();
    if (!response.ok) throw new Error(result.error || '请求失败，请重试');
    return result;
  } catch(error) {
    if(error.name==='AbortError') throw new Error('请求超时，后台可能仍在处理，请稍后重试。');
    throw error;
  } finally {clearTimeout(timer);}
}
function sourceLink(source) {
  const safe=typeof source.url==='string' && /^https:\/\//.test(source.url);
  return safe?`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.name)} ↗</a>`:esc(source.name||'来源未提供');
}
function syncContext() {
  const c=context();
  $('#mode-note').textContent=c.mode==='sample'?'历史样例 · 真实数据快照，非实时行情 · 覆盖 2023—2025 年':'在线查询 · 按请求获取历史数据，不提供实时买卖报价';
  $('#chat-context').textContent=`当前研究：${names[c.symbol]||c.symbol} · ${c.mode==='sample'?'历史样例':'在线查询'}`;
  document.querySelectorAll('[data-company]').forEach(button=>{
    button.querySelector('.company-dot')?.remove();
    if(button.dataset.company===c.symbol) button.insertAdjacentHTML('beforeend','<span class="company-dot"></span>');
  });
}
function invalidate() {
  state.results={};state.answers=[];state.messages=[];
  $('#conversation').innerHTML=welcomeHTML;
  syncContext();notice();
  area.innerHTML='<div class="empty">查询条件已改变，点击“查询”加载对应数据。</div>';
}
function metric(label,value,note,sign='') {
  return `<div class="metric"><label>${esc(label)}</label><span class="metric-icon">↗</span><div class="value ${sign}">${esc(value)}</div><small>${esc(note)}</small></div>`;
}
function overview(data) {
  const s=data.summary;
  return `<div class="section-title"><h2>${esc(data.name)} <span class="subtle">${esc(data.symbol)} · A 股</span></h2><span class="tag">${data.source.mode==='sample'?'历史样例':'在线数据'} · 前复权</span></div>
    <div class="metrics">${metric('区间末收盘价',number(s.last_close),'前复权价格 · 元')}${metric('区间涨跌幅',percent(s.return),'首末交易日收盘价比较',s.return>=0?'positive':'negative')}${metric('区间最高收盘价',number(s.high_close),'非盘中最高价 · 元')}${metric('交易日数量',number(s.days,0),'实际有效数据点')}</div>
    <section class="card"><div class="card-heading"><div><h3>价格走势 <span class="subtle">/ PRICE HISTORY</span></h3><p>${esc(s.first_date)} — ${esc(s.last_date)} · 日线收盘价</p></div><div class="segmented">${[2023,2024,2025].map(y=>`<button data-year="${y}" class="${context().start===y+'-01-01'?'selected':''}">${y}</button>`).join('')}</div></div><div class="chart">${chartSVG([{name:'前复权收盘价',values:data.bars.map(b=>b.close)}],data.bars.map(b=>b.date))}</div><div class="chart-note"><span>来源：${sourceLink(data.source)} · ${esc(data.source.volume_unit)}为成交量单位</span><span>按获取日口径复权，非当时成交报价</span></div></section>
    <section class="card"><div class="card-heading"><div><h3>成交量 <span class="subtle">/ VOLUME</span></h3><p>每日成交量 · 万手</p></div><span class="tag">观察交易活跃程度</span></div><div class="chart">${chartSVG([{name:'成交量（万手）',values:data.bars.map(b=>b.volume/10000)}],data.bars.map(b=>b.date))}</div></section>
    <div class="below-grid"><section class="card"><div class="insight-heading"><span>◈</span>数据速览</div><ul class="insight-list"><li><span>区间首日收盘</span><b>${number(s.first_close)} 元</b></li><li><span>区间最低收盘</span><b>${number(s.low_close)} 元</b></li><li><span>实际覆盖</span><b>${esc(s.first_date)} → ${esc(s.last_date)}</b></li></ul></section><section class="card explain-card"><h3>✧ 价格变化，不等于经营变化</h3><p>股价还受到预期、市场情绪和估值等因素影响。结合财务数据，才能更完整地理解一家企业。</p><button class="text-button" data-go="compare">下一步：比较企业财务表现 →</button></section></div>`;
}
function compareControls() {
  return `<section class="card"><div class="inline-controls"><label>对比公司<select id="other">${Object.entries(names).map(([code,name])=>`<option value="${code}" ${state.other===code?'selected':''}>${name} · ${code}</option>`).join('')}</select></label><label>报告期<input id="period" type="date" value="${esc(state.period)}" class="period-input"></label><button class="primary" id="compare-run">更新对比 ↗</button></div><p class="subtle">金额为合并报表口径；季度数据为年初至报告期末累计值。历史样例支持 2023—2025 年报。</p></section>`;
}
const financialRows=[['revenue','营业总收入',v=>money(v)+' 元'],['parent_profit','归母净利润',v=>money(v)+' 元'],['net_margin','净利率',v=>number(v)+'%'],['debt_ratio','资产负债率',v=>number(v)+'%'],['operating_cash','经营活动现金流净额',v=>money(v)+' 元'],['roe','加权平均净资产收益率',v=>number(v)+'%']];
function comparison(data) {
  const [a,b]=data.companies;
  const table=financialRows.map(([key,label,fmt])=>`<tr><td>${label}</td><td>${a.metrics[key]==null?'—':esc(fmt(a.metrics[key]))}</td><td>${b.metrics[key]==null?'—':esc(fmt(b.metrics[key]))}</td></tr>`).join('');
  const bars=['net_margin','debt_ratio'].map((key,i)=>{
    const values=[a,b].map(c=>c.metrics[key]);
    const max=Math.max(...values.filter(v=>v!=null).map(Math.abs),1);
    return `<div class="bar-item"><h4>${i?'资产负债率':'净利率'} · %</h4>${[a,b].map(c=>`<div class="bar-row"><div class="bar-caption"><span>${esc(c.name)}</span><span>${number(c.metrics[key])}${c.metrics[key]==null?'':'%'}</span></div><div class="bar-track"><div class="bar-fill" style="width:${c.metrics[key]==null?0:Math.min(100,Math.abs(c.metrics[key])/max*100)}%"></div></div></div>`).join('')}</div>`;
  }).join('');
  return compareControls()+`<section class="card"><div class="card-heading"><h3>同一报告期 · ${esc(data.period)}</h3><span class="tag">公开财务数据</span></div><div class="table-wrap"><table class="comparison-table"><thead><tr><th>财务指标</th><th>${esc(a.name)}</th><th>${esc(b.name)}</th></tr></thead><tbody>${table}<tr><td>披露日期</td><td>${esc(a.metrics.notice_date||'未提供')}</td><td>${esc(b.metrics.notice_date||'未提供')}</td></tr></tbody></table></div><div class="metric-bars">${bars}</div><div class="chart-note"><span>净利率为数据源公布值，不能将归母净利润直接作为总净利润计算。</span><span>— 表示未提供</span></div></section><section class="card explain-card"><h3>比较之前，先对齐口径</h3><p>指标高低并不直接等于投资价值。跨行业比较时要考虑业务模式差异；讨论过去某一天时，还必须确认财报在当时是否已披露。</p><button class="text-button" data-ask="比较当前两家公司的财务表现，区分事实和推测，指出仍需核实的问题。">让 AI 帮我解释这些差异 →</button></section>`;
}
function parameterControls() {
  const fields=[['short','短期均线 / 日',1,119],['long','长期均线 / 日',2,120],['capital','初始资金 / 元',100,1e9],['fee_bps','双边手续费 / 基点',0,100],['slippage_bps','单边滑点 / 基点',0,100]];
  return `<section class="card"><div class="card-heading"><h3>双均线策略 <span class="subtle">/ MA CROSS</span></h3><span class="tag">教学实验</span></div><div class="parameter-grid">${fields.map(([key,label,min,max])=>`<label>${label}<input data-param="${key}" type="number" min="${min}" max="${max}" step="${key.includes('bps')?'.1':'1'}" value="${state.parameters[key]}"></label>`).join('')}</div><div class="run-row"><p>短均线高于长均线时持有，低于时空仓。<br>上一交易日收盘判断，下一交易日开盘执行；1 基点 = 0.01%。</p><button id="run-backtest" class="primary">运行回测 ↗</button></div></section>`;
}
function backtestView(data) {
  if(!data) return parameterControls()+'<section class="card explain-card"><h3>先提出假设，再查看结果</h3><p>例如：趋势跟随策略是否能降低持有期间的回撤？点击“运行回测”，同时观察收益与风险，避免仅挑选收益最高的参数。</p></section>';
  const m=data.metrics;
  return parameterControls()+`<div class="metrics">${metric('策略累计收益',percent(m.return),'扣除设定成本',m.return>=0?'positive':'negative')}${metric('买入持有收益',percent(m.baseline_return),'相同区间与成本',m.baseline_return>=0?'positive':'negative')}${metric('策略最大回撤',percent(m.max_drawdown),'含初始资金基准','negative')}${metric('交易次数',number(m.trade_count,0),'单次买入或卖出各计 1 次')}</div><section class="card"><div class="card-heading"><div><h3>累计收益对比</h3><p>${esc(data.name)} · ${esc(data.coverage.start)} — ${esc(data.coverage.end)}</p></div><span class="tag">预热 ${data.coverage.warmup_days} 个交易日</span></div><div class="chart">${chartSVG([{name:'双均线策略',values:data.curve.map(r=>r.strategy)},{name:'买入持有',values:data.curve.map(r=>r.baseline)}],data.curve.map(r=>r.date),{percent:true})}</div><div class="chart-note"><span>期末权益：${number(m.final_value)} 元</span><span>期末未强制平仓</span></div></section><section class="card"><div class="card-heading"><h3>成交记录 <span class="subtle">/ ${data.trades.length} 笔</span></h3></div><div class="table-wrap"><table class="comparison-table trade-table"><thead><tr><th>信号日期</th><th>成交日期</th><th>操作</th><th>成交价 / 元</th><th>份额</th><th>手续费 / 元</th></tr></thead><tbody>${data.trades.length?data.trades.map(t=>`<tr><td>${esc(t.signal_date)}</td><td>${esc(t.date)}</td><td>${esc(t.side)}</td><td>${number(t.price)}</td><td>${number(t.shares)}</td><td>${number(t.fee)}</td></tr>`).join(''):'<tr><td colspan="6">该区间未触发交易信号</td></tr>'}</tbody></table></div></section><section class="card explain-card"><h3>回测假设与限制</h3><ul class="assumptions">${data.assumptions.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></section>`;
}
function collectSources(value, list=[]) {
  if(!value || typeof value!=='object') return list;
  if(value.source) list.push(value.source);
  for(const [key,item] of Object.entries(value)) if(key!=='source' && typeof item==='object') collectSources(item,list);
  return list;
}
function sourcesView() {
  const sources=collectSources({results:state.results,answers:state.answers});
  const unique=[...new Map(sources.map(s=>[s.url+'|'+s.mode,s])).values()];
  const cards=unique.map(s=>`<section class="card source-card"><h3>${esc(s.name)}</h3><dl><dt>模式</dt><dd>${s.mode==='sample'?'历史样例 · 真实快照':'在线查询'}</dd><dt>获取时间</dt><dd>${esc(s.fetched_at)}</dd><dt>单位 / 口径</dt><dd>${esc(s.unit||`${s.price_unit} / ${s.volume_unit} · ${s.adjustment}`)}</dd>${s.scope?`<dt>指标说明</dt><dd>${esc(s.scope)}</dd>`:''}<dt>来源链接</dt><dd>${sourceLink(s)}</dd></dl>${s.urls?.length>1?`<details><summary>查看全部 ${s.urls.length} 个分年查询链接</summary>${s.urls.map((url,i)=>`<p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">分年查询 ${i+1} ↗</a></p>`).join('')}</details>`:''}</section>`).join('');
  return `<div class="section-title"><h2>本次研究的数据来源</h2><span class="tag">${unique.length} 项</span></div>${cards||'<div class="empty">完成一次行情查询、企业对比或 AI 分析后，这里会显示对应来源。</div>'}<section class="card explain-card"><h3>如何核验一个结论？</h3><p>先检查公司、日期、单位和数据模式，再核对计算方式。AI 的解释需要与引用的数据一致；没有数据支持的原因分析应被视为待验证的推测。在线数据可能被后续修订，历史快照记录的是获取时的版本。</p></section>`;
}
function render() {
  if(state.tab==='overview') area.innerHTML=state.results.overview?overview(state.results.overview):'<div class="empty">点击查询，加载历史行情。</div>';
  if(state.tab==='compare') area.innerHTML=state.results.compare?comparison(state.results.compare):compareControls();
  if(state.tab==='backtest') area.innerHTML=backtestView(state.results.backtest);
  if(state.tab==='sources') area.innerHTML=sourcesView();
}
async function load(runStrategy=false) {
  if(state.busy) return;
  notice();syncContext();
  if(state.tab==='sources'){render();return;}
  if(state.tab==='backtest'&&!runStrategy){render();return;}
  const c=context(), tab=state.tab;
  setBusy(1);
  area.innerHTML='<div class="loading-block"><span class="spinner"></span>正在获取并核对数据…</div>';
  try {
    const path=tab==='overview'?'/api/history':tab==='compare'?'/api/compare':'/api/backtest';
    const body=tab==='compare'?{symbols:[c.symbol,c.other],mode:c.mode,period:c.period}:{symbol:c.symbol,mode:c.mode,start:c.start,end:c.end,...(tab==='backtest'?state.parameters:{})};
    const result=await api(path,body);
    state.results[tab]=result;
    render();
    const warnings=result.warnings||result.companies?.flatMap(c=>c.warnings||[])||[];
    notice([...new Set(warnings)].join(' '));
  } catch(error) {
    delete state.results[tab];render();notice(error.message);
  } finally {setBusy(-1);}
}
function switchTab(tab) {
  if(state.busy || !tabs[tab])return;
  state.tab=tab;notice();
  $('#crumb').textContent=tabs[tab][0];$('#page-title').textContent=tabs[tab][1];$('#page-subtitle').textContent=tabs[tab][2];
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  if(state.results[tab]||tab==='backtest'||tab==='sources')render();else load();
}
function message(role,text) {
  const el=document.createElement('div');el.className='message '+role;el.textContent=text;$('#conversation').append(el);el.scrollIntoView({block:'nearest'});return el;
}
function appendAnswer(result) {
  const el=document.createElement('div');el.className='message answer';
  el.innerHTML=`<div class="message-label">✧ ${result.kind==='live'?'DeepSeek · AI 解读':'本地规则摘要 · 非 AI'}</div><div class="answer-body"></div><div class="tool-log">${esc((result.tool_log||[]).map(t=>`${t.tool} · ${t.status}`).join(' → '))}</div><div class="evidence">${(result.evidence||[]).map(e=>`<details><summary>[${esc(e.id)}] 查看数据依据</summary><pre>${esc(JSON.stringify(e.data,null,2))}</pre></details>`).join('')}</div>`;
  el.querySelector('.answer-body').innerHTML=renderMarkdown(result.answer);
  $('#conversation').append(el);el.scrollIntoView({block:'nearest'});
}
async function ask(question,local=false) {
  if(state.busy||(!local&&!question.trim()))return;
  if(!state.answers.length&&!state.messages.length)$('#conversation').innerHTML='';
  message('user',local?'生成当前行情的本地数据摘要':question);
  const pending=message('pending',local?'正在根据数据计算摘要…':'DeepSeek 正在查询和分析，请稍候…');
  const c=context();setBusy(1);
  try {
    const r=await api(local?'/api/demo':'/api/chat',local?{context:c}:{question,context:c,history:state.messages});
    state.answers.push(r);
    if(!local)state.messages.push({role:'user',content:question},{role:'assistant',content:r.answer});
    pending.remove();appendAnswer(r);$('#question').value='';
    if(state.tab==='sources')render();
  } catch(error) {pending.textContent=error.message;pending.className='message notice';}
  finally {setBusy(-1);}
}

document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.tab)switchTab(b.dataset.tab);
  if(b.dataset.go)switchTab(b.dataset.go);
  if(b.dataset.company&&!state.busy){$('#symbol').value=b.dataset.company;invalidate();load();}
  if(b.dataset.year&&!state.busy){$('#start').value=b.dataset.year+'-01-01';$('#end').value=b.dataset.year+'-12-31';invalidate();load();}
  const question=b.dataset.question||b.dataset.ask;
  if(question){$('#question').value=question;$('#question').focus();}
});
area.addEventListener('change',event=>{
  if(state.busy)return;
  if(event.target.id==='other'){state.other=event.target.value;delete state.results.compare;state.messages=[];state.answers=[];$('#conversation').innerHTML=welcomeHTML;render();}
  if(event.target.id==='period'){state.period=event.target.value;delete state.results.compare;state.messages=[];state.answers=[];$('#conversation').innerHTML=welcomeHTML;render();}
  if(event.target.dataset.param){
    state.parameters[event.target.dataset.param]=Number(event.target.value);
    delete state.results.backtest;
    state.answers=[];
    state.messages=[];
    $('#conversation').innerHTML=welcomeHTML;
    render();
  }
});
area.addEventListener('click',event=>{
  const id=event.target.closest('button')?.id;
  if(id==='compare-run')load();
  if(id==='run-backtest')load(true);
});
document.querySelectorAll('.filters input,.filters select').forEach(el=>el.addEventListener('change',()=>{if(!state.busy)invalidate();}));
$('#refresh').onclick=()=>load(state.tab==='backtest');
$('#source-shortcut').onclick=()=>switchTab('sources');
$('#chat-form').onsubmit=event=>{event.preventDefault();ask($('#question').value);};
$('#question').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();ask($('#question').value);}};
$('#demo').onclick=()=>ask('',true);
$('#guide').onclick=()=>$('#guide-dialog').showModal();
$('#config-button').onclick=$('#setup-link').onclick=()=>$('#settings-dialog').showModal();
$('#export').onclick=()=>{
  if(!Object.keys(state.results).length&&!state.answers.length){notice('请先完成一次分析，再导出简报。');return;}
  const compact=JSON.parse(JSON.stringify(state.results));
  if(compact.overview)delete compact.overview.bars;
  if(compact.backtest)delete compact.backtest.curve;
  const content=reportText({title:'知衡 FinSight · 金融分析简报',mode:context().mode,context:context(),result:compact},state.answers);
  const url=URL.createObjectURL(new Blob(['\ufeff'+content],{type:'text/markdown;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`金融分析简报-${context().symbol}-${context().end}.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
};
async function boot(){
  try {
    state.status=await api('/api/status');
    $('#connection').classList.toggle('off',!state.status.configured);
    $('#connection span').textContent=state.status.configured?'密钥已配置 · 发送问题后验证连接':'尚未配置密钥 · 本地分析可用';
    $('#model-detail').textContent=`当前模型：${state.status.model}。密钥${state.status.configured?'已':'未'}配置。`;
  } catch {$('#connection span').textContent='无法连接本机服务，请通过启动脚本打开';}
  syncContext();await load();
}
boot();
