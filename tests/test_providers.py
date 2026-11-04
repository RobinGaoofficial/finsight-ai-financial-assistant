import importlib.util
import unittest
from unittest.mock import patch


class ProviderTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('providers'), 'Provider module not implemented')
        import providers
        self.p = providers

    def test_restricts_symbols_and_dates(self):
        self.assertEqual(self.p.symbol_code('贵州茅台'), '600519')
        for code in ['../../.env', '" OR 1', '123', 'http://localhost']:
            with self.assertRaises(ValueError):
                self.p.symbol_code(code)
        with self.assertRaises(ValueError):
            self.p.history('600519', 'sample', '2024-12-31', '2024-01-01')

    def test_snapshot_has_real_source_and_rejects_unknown_sample(self):
        r = self.p.history('600519', 'sample', '2024-01-01', '2024-12-31')
        self.assertGreater(len(r['bars']), 200)
        self.assertEqual(r['source']['mode'], 'sample')
        self.assertIn('https://', r['source']['url'])
        self.assertTrue(r['source']['fetched_at'])
        with self.assertRaises(ValueError):
            self.p.history('600000', 'sample', '2024-01-01', '2024-12-31')

    def test_period_must_match_exactly(self):
        r = self.p.compare(['600519','000858'], 'sample', '2024-12-31')
        self.assertEqual([x['metrics']['period'] for x in r['companies']], ['2024-12-31']*2)
        with self.assertRaises(ValueError):
            self.p.financials('600519','sample','1999-12-31')

    def test_online_failure_does_not_fall_back_to_sample(self):
        with patch.object(self.p, 'read_json', side_effect=ValueError('network unavailable')):
            with self.assertRaisesRegex(ValueError, 'network unavailable'):
                self.p.history('600519', 'online', '2024-01-01', '2024-12-31')


if __name__ == '__main__':
    unittest.main()
