import importlib.util
import unittest


class FinanceTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('finance'), 'Financial calculation module is not implemented')
        import finance
        self.f = finance

    def bars(self):
        return [{'date': f'2024-01-{i+1:02}', 'open': o, 'close': c, 'volume': 100}
                for i, (o, c) in enumerate([(10, 10), (10, 10), (10, 12), (20, 22), (22, 1), (7, 7)])]

    def test_signal_executes_next_open_and_costs_are_applied(self):
        r = self.f.backtest(self.bars(), '2024-01-03', '2024-01-06', 2, 3, 1000, 10, 0)
        self.assertEqual(r['trades'][0]['date'], '2024-01-04')
        self.assertEqual(r['trades'][0]['price'], 20)
        self.assertEqual(r['trades'][1]['date'], '2024-01-06')
        self.assertAlmostEqual(r['metrics']['final_value'], 1000 / 1.001 / 20 * 7 * .999, places=6)
        self.assertLess(r['metrics']['max_drawdown'], -.6)

    def test_last_signal_does_not_invent_a_trade(self):
        r = self.f.backtest(self.bars()[:3], '2024-01-03', '2024-01-03', 2, 3, 1000, 0, 0)
        self.assertEqual(r['trades'], [])
        self.assertEqual(r['metrics']['final_value'], 1000)

    def test_initial_equity_included_in_drawdown(self):
        rows = [{'date': f'2024-01-0{i+1}', 'open': 10, 'close': c} for i, c in enumerate([10, 11, 5])]
        r = self.f.backtest(rows, '2024-01-03', '2024-01-03', 1, 2, 1000, 0, 0)
        self.assertEqual(r['metrics']['max_drawdown'], -.5)
        self.assertEqual(r['metrics']['baseline_return'], -.5)

    def test_rejects_insufficient_warmup_and_invalid_numbers(self):
        for args in [(2, 10, 1000, 0, 0), (3, 2, 1000, 0, 0), (2, 3, float('nan'), 0, 0), (2, 3, 1000, -1, 0)]:
            with self.assertRaises(ValueError):
                self.f.backtest(self.bars(), '2024-01-03', '2024-01-06', *args)

    def test_summary_and_missing_financial_values(self):
        r = self.f.summarize(self.bars())
        self.assertAlmostEqual(r['return'], -.3)
        self.assertEqual(r['last_close'], 7)
        r = self.f.normalize_financial({'REPORT_DATE':'2024-12-31 00:00:00', 'TOTALOPERATEREVE':0, 'PARENTNETPROFIT':None, 'XSJLL':None, 'ZCFZL':25})
        self.assertIsNone(r['parent_profit'])
        self.assertIsNone(r['net_margin'])
        self.assertEqual(r['debt_ratio'], 25)

    def test_rejects_unsorted_or_nonpositive_bars(self):
        for rows in [list(reversed(self.bars())), [{'date':'2024-01-01','open':0,'close':10}]]:
            with self.assertRaises(ValueError):
                self.f.summarize(rows)


if __name__ == '__main__':
    unittest.main()
