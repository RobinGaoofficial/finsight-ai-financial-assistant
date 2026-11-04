"""Deterministic calculations. Returns are fractions; published ratios are percent."""
import math
from datetime import date


def finite(value, label, low=None, high=None):
    if isinstance(value, bool):
        raise ValueError(label + '必须是有效数字')
    try:
        number = float(value)
    except (ValueError, TypeError):
        raise ValueError(label + '必须是有效数字') from None
    if not math.isfinite(number) or (low is not None and number < low) or (high is not None and number > high):
        raise ValueError(label + '超出允许范围')
    return number


def iso_date(value):
    if not isinstance(value, str) or len(value) != 10:
        raise ValueError('日期格式应为 YYYY-MM-DD')
    try:
        result = date.fromisoformat(value)
    except ValueError:
        raise ValueError('日期无效') from None
    if result.isoformat() != value:
        raise ValueError('日期格式应为 YYYY-MM-DD')
    return result


def validate_bars(bars):
    if not bars:
        raise ValueError('所选日期没有可用行情')
    previous = ''
    for row in bars:
        iso_date(row['date'])
        if row['date'] <= previous:
            raise ValueError('行情日期必须严格递增且不重复')
        previous = row['date']
        finite(row['open'], '开盘价', .000001)
        finite(row['close'], '收盘价', .000001)


def summarize(bars):
    validate_bars(bars)
    prices = [float(row['close']) for row in bars]
    return {'first_date': bars[0]['date'], 'last_date': bars[-1]['date'],
            'first_close': prices[0], 'last_close': prices[-1],
            'return': prices[-1] / prices[0] - 1,
            'high_close': max(prices), 'low_close': min(prices), 'days': len(bars)}


def normalize_financial(row):
    fields = {'revenue': 'TOTALOPERATEREVE', 'parent_profit': 'PARENTNETPROFIT',
              'net_margin': 'XSJLL', 'debt_ratio': 'ZCFZL',
              'operating_cash': 'NETCASH_OPERATE_PK', 'roe': 'ROEJQ'}
    result = {'period': row['REPORT_DATE'][:10], 'notice_date': (row.get('NOTICE_DATE') or '')[:10]}
    for key, field in fields.items():
        value = row.get(field)
        try:
            result[key] = finite(value, field) if value is not None else None
        except ValueError:
            result[key] = None
    return result


def backtest(bars, start, end, short=5, long=20, capital=100000, fee_bps=3, slippage_bps=5):
    validate_bars(bars)
    if iso_date(start) > iso_date(end):
        raise ValueError('开始日期不能晚于结束日期')
    short_n, long_n = finite(short, '短均线', 1, 119), finite(long, '长均线', 2, 120)
    if short_n != int(short_n) or long_n != int(long_n) or short_n >= long_n:
        raise ValueError('均线周期必须是整数，且短期小于长期')
    short, long = int(short_n), int(long_n)
    capital = finite(capital, '初始资金', 100, 1e9)
    fee = finite(fee_bps, '手续费（基点）', 0, 100) / 10000
    slip = finite(slippage_bps, '滑点（基点）', 0, 100) / 10000
    selected = [i for i, row in enumerate(bars) if start <= row['date'] <= end]
    if not selected:
        raise ValueError('回测区间没有交易数据')
    if selected[0] < long - 1:
        raise ValueError('预热数据不足，请缩短均线周期或推迟开始日期')
    closes = [float(row['close']) for row in bars]
    cash, shares, peak, drawdown = capital, 0.0, capital, 0.0
    first_open = float(bars[selected[0]]['open'])
    baseline_shares = capital / (first_open * (1 + slip) * (1 + fee))
    trades, curve = [], []
    for i in selected:
        row = bars[i]
        # Only data through the PREVIOUS close can determine today's opening trade.
        if i >= long:
            fast = sum(closes[i-short:i]) / short
            slow = sum(closes[i-long:i]) / long
            if fast > slow and shares == 0:
                price = float(row['open']) * (1 + slip)
                shares = cash / (price * (1 + fee))
                cost = shares * price * fee
                cash = 0.0
                trades.append({'date':row['date'], 'signal_date':bars[i-1]['date'], 'side':'买入', 'price':price, 'shares':shares, 'fee':cost})
            elif fast < slow and shares > 0:
                price = float(row['open']) * (1 - slip)
                cost = shares * price * fee
                cash = shares * price - cost
                trades.append({'date':row['date'], 'signal_date':bars[i-1]['date'], 'side':'卖出', 'price':price, 'shares':shares, 'fee':cost})
                shares = 0.0
        equity = cash + shares * float(row['close'])
        peak = max(peak, equity)
        drawdown = min(drawdown, equity / peak - 1)
        baseline = baseline_shares * float(row['close'])
        curve.append({'date':row['date'], 'strategy':equity/capital-1, 'baseline':baseline/capital-1, 'equity':equity})
    return {'curve':curve, 'trades':trades,
            'metrics':{'return':curve[-1]['strategy'], 'baseline_return':curve[-1]['baseline'],
                       'max_drawdown':drawdown, 'final_value':curve[-1]['equity'], 'trade_count':len(trades)},
            'parameters':{'short':short, 'long':long, 'capital':capital, 'fee_bps':fee*10000, 'slippage_bps':slip*10000},
            'coverage':{'start':curve[0]['date'], 'end':curve[-1]['date'], 'warmup_days':selected[0]},
            'assumptions':['前一交易日收盘信号，下一交易日开盘成交；区间初始持仓为空。',
                           '买入持有在首个开盘买入；双方采用相同手续费与滑点，期末按收盘估值，不强制平仓。',
                           '前复权价格、连续份额；未模拟整手、涨跌停成交限制和税费差异。',
                           '教学回测，不代表实际可成交收益或未来收益。']}
