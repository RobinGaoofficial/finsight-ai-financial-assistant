"""Explicit maintenance command; fetch snapshots without API keys or packages."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from providers import COMPANIES, ROOT, fetch_prices, fetch_financials, stamp

if __name__ == '__main__':
    result = {'description':'真实历史数据快照；不是实时行情，也不是模拟数据。', 'captured_at':stamp(), 'companies':{}}
    for code, name in COMPANIES.items():
        history = fetch_prices(code, '2023-01-01', '2025-12-31')
        reports = {period:fetch_financials(code,period) for period in ['2023-12-31','2024-12-31','2025-12-31']}
        result['companies'][code] = {'history':history, 'financials':reports}
        print(code, len(history['bars']), 'daily bars;', len(reports), 'annual reports')
    target = ROOT / 'data' / 'samples.json'
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Saved real snapshots.')
