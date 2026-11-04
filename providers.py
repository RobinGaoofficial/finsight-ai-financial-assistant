"""Read-only public data adapters; upstream failures never silently become sample data."""
import copy
import json
import re
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from finance import iso_date, summarize, normalize_financial, backtest

ROOT = Path(__file__).resolve().parent
COMPANIES = {'600519':'贵州茅台', '000858':'五粮液', '600036':'招商银行'}
CACHE = {}


def symbol_code(value):
    if not isinstance(value, str):
        raise ValueError('请输入公司名称或六位 A 股代码')
    value = value.strip()
    for code, name in COMPANIES.items():
        if value == name:
            return code
    if not re.fullmatch(r'(?:60|68|00|30)\d{4}', value):
        raise ValueError('请输入沪深 A 股六位代码；名称查询支持三家样例公司')
    return value


def mode_check(mode):
    if mode not in ('sample', 'online'):
        raise ValueError('数据模式只能是 sample 或 online')


def stamp():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def read_json(url):
    cached = CACHE.get(url)
    if cached and time.monotonic() - cached[0] < 300:
        return copy.deepcopy(cached[1])
    try:
        request = Request(url, headers={'User-Agent':'Mozilla/5.0', 'Referer':'https://finance.qq.com/'})
        with urlopen(request, timeout=15) as response:
            payload = response.read(8_000_001)
        if len(payload) > 8_000_000:
            raise ValueError('数据源返回内容过大')
        result = json.loads(payload)
    except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError):
        raise ValueError('在线数据源暂时不可用，请稍后重试或手动切换历史样例') from None
    if len(CACHE) > 100:
        CACHE.clear()
    snapshot = (result, stamp())
    CACHE[url] = (time.monotonic(), snapshot)
    return copy.deepcopy(snapshot)


def sample(symbol):
    try:
        content = json.loads((ROOT / 'data' / 'samples.json').read_text(encoding='utf-8'))
        return content['companies'][symbol]
    except (FileNotFoundError, KeyError):
        raise ValueError('历史样例仅支持贵州茅台、五粮液和招商银行；其他代码请切换在线模式') from None


def fetch_prices(symbol, start, end):
    code = symbol_code(symbol)
    first, last = iso_date(start), iso_date(end)
    if first > last or last.year - first.year > 6:
        raise ValueError('行情区间应为顺序日期且不超过六年')
    ticker = ('sh' if code.startswith(('6', '68')) else 'sz') + code
    rows, urls, timestamps = {}, [], []
    for year in range(first.year, last.year + 1):
        left = max(start, f'{year}-01-01')
        right = min(end, f'{year}-12-31')
        url = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?' + urlencode({'param':f'{ticker},day,{left},{right},640,qfq'})
        raw, fetched_at = read_json(url)
        timestamps.append(fetched_at)
        item = (raw.get('data') or {}).get(ticker, {})
        # Unadjusted fallback is intentionally forbidden: never mix adjustment bases.
        records = item.get('qfqday', [])
        for record in records:
            if left <= record[0] <= right:
                rows[record[0]] = {'date':record[0], 'open':float(record[1]), 'close':float(record[2]),
                                   'high':float(record[3]), 'low':float(record[4]), 'volume':float(record[5])}
        urls.append(url)
    bars = [rows[key] for key in sorted(rows)]
    summarize(bars)
    return {'symbol':code, 'name':COMPANIES.get(code, code), 'bars':bars,
            'source':{'name':'腾讯财经历史日线', 'url':urls[0], 'urls':urls, 'fetched_at':min(timestamps), 'query_fetch_times':timestamps,
                      'mode':'online', 'adjustment':'前复权（按获取日口径）', 'price_unit':'元', 'volume_unit':'手'}}


def history(symbol, mode, start, end, warmup=0):
    code = symbol_code(symbol)
    mode_check(mode)
    first, last = iso_date(start), iso_date(end)
    if first > last or (last - first).days > 5*366:
        raise ValueError('请选择不超过五年的有效日期区间')
    if mode == 'sample':
        result = copy.deepcopy(sample(code)['history'])
        if start < '2023-01-01' or end > '2025-12-31':
            raise ValueError('历史样例覆盖 2023—2025 年，请调整日期或切换在线模式')
        result['source']['mode'] = 'sample'
    else:
        fetch_start = (first - timedelta(days=max(0, warmup)*3+15)).isoformat() if warmup else start
        result = fetch_prices(code, fetch_start, end)
    all_bars = result['bars']
    selected = [r for r in all_bars if start <= r['date'] <= end]
    result['summary'] = summarize(selected)
    if warmup:
        prior = [r for r in all_bars if r['date'] < start][-warmup:]
        result['bars'] = prior + selected
    else:
        result['bars'] = selected
    result['requested'] = {'start':start, 'end':end}
    result['warnings'] = []
    if (iso_date(selected[0]['date'])-first).days > 14 or (last-iso_date(selected[-1]['date'])).days > 14:
        result['warnings'].append('数据实际覆盖范围与请求区间存在较大差异，请核对停牌、上市时间或数据源覆盖情况。')
    return result


def fetch_financials(symbol, period):
    code = symbol_code(symbol)
    iso_date(period)
    secucode = code + ('.SH' if code.startswith('6') else '.SZ')
    params = {'reportName':'RPT_F10_FINANCE_MAINFINADATA', 'columns':'ALL',
              'filter':f'(SECUCODE="{secucode}")(REPORT_DATE=\'{period}\')',
              'pageSize':1, 'pageNumber':1, 'sortColumns':'REPORT_DATE', 'sortTypes':-1, 'source':'HSF10', 'client':'PC'}
    url = 'https://datacenter.eastmoney.com/securities/api/data/v1/get?' + urlencode(params)
    raw, fetched_at = read_json(url)
    records = (raw.get('result') or {}).get('data') or []
    if not records or records[0].get('REPORT_DATE', '')[:10] != period:
        raise ValueError('该公司在所选报告期没有可用财务数据，请选择已披露的报告期')
    row = records[0]
    return {'symbol':code, 'name':row.get('SECURITY_NAME_ABBR') or COMPANIES.get(code,code),
            'metrics':normalize_financial(row),
            'source':{'name':'东方财富财务指标', 'url':url, 'fetched_at':fetched_at, 'mode':'online',
                      'unit':'金额：元；比率：百分比', 'scope':'合并报表；净利率为数据源公布值，不能用归母净利润直接替代总净利润计算'},
            'warnings':['金融企业和非金融企业的指标口径、业务结构差异较大，请谨慎跨行业比较。'] if code == '600036' or row.get('ORG_TYPE') not in (None, '通用') else []}


def financials(symbol, mode, period):
    code = symbol_code(symbol)
    mode_check(mode)
    iso_date(period)
    if period[5:] not in ('03-31', '06-30', '09-30', '12-31'):
        raise ValueError('请选择季度末或年度末报告期')
    if mode == 'online':
        return fetch_financials(code, period)
    try:
        result = copy.deepcopy(sample(code)['financials'][period])
    except KeyError:
        raise ValueError('历史样例包含 2023、2024、2025 年报，请选择对应年末日期') from None
    result['source']['mode'] = 'sample'
    return result


def compare(symbols, mode, period):
    if not isinstance(symbols, list) or len(symbols) != 2:
        raise ValueError('请选择两家公司进行比较')
    codes = [symbol_code(code) for code in symbols]
    if codes[0] == codes[1]:
        raise ValueError('请选择两家不同的公司')
    return {'companies':[financials(code, mode, period) for code in codes], 'period':period}


def strategy(symbol, mode, start, end, short=5, long=20, capital=100000, fee_bps=3, slippage_bps=5):
    from finance import finite
    warmup = finite(long, '长均线', 2, 120)
    if warmup != int(warmup):
        raise ValueError('均线周期必须是整数')
    data = history(symbol, mode, start, end, warmup=int(warmup))
    result = backtest(data['bars'], start, end, short, long, capital, fee_bps, slippage_bps)
    return {**result, 'source':data['source'], 'symbol':data['symbol'], 'name':data['name'], 'warnings':data['warnings']}
