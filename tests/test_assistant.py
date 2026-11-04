import importlib.util
import unittest
from unittest.mock import patch


class AssistantTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('assistant'), 'AI orchestration not implemented')
        import assistant
        self.a = assistant
        self.context = {'symbol':'600519','other':'000858','mode':'sample','start':'2024-01-01','end':'2024-12-31','period':'2024-12-31'}

    def test_missing_key_does_not_claim_ai_success(self):
        with patch.dict('os.environ', {}, clear=True):
            with self.assertRaisesRegex(ValueError, 'DeepSeek'):
                self.a.chat('解释一下行情', self.context)

    def test_unknown_tool_and_extra_arguments_rejected(self):
        with self.assertRaises(ValueError):
            self.a.execute_tool('run_python', {'code':'print(1)'}, self.context)
        with self.assertRaises(ValueError):
            self.a.execute_tool('get_history', {'symbol':'600519','mode':'online','secret':'x'}, self.context)

    def test_tool_result_contains_evidence_and_mode_cannot_be_overridden(self):
        r = self.a.execute_tool('get_history', {'symbol':'600519'}, self.context)
        self.assertEqual(r['source']['mode'], 'sample')
        self.assertIn('summary', r)
        self.assertNotIn('bars', r)

    def test_model_tool_roundtrip(self):
        calls = [
            {'role':'assistant','content':None,'tool_calls':[{'id':'one','type':'function','function':{'name':'get_history','arguments':'{"symbol":"600519"}'}}]},
            {'role':'assistant','content':'请核对历史数据 [D1]。'}]
        with patch.dict('os.environ', {'DEEPSEEK_API_KEY':'not-a-real-key'}), patch.object(self.a,'completion',side_effect=calls):
            r = self.a.chat('查询茅台', self.context)
        self.assertEqual(r['kind'], 'live')
        self.assertEqual(r['evidence'][0]['id'], 'D1')
        self.assertIn('D1', r['answer'])
        self.assertNotIn('not-a-real-key', str(r))

    def test_backtest_uses_page_parameters_and_explicit_overrides(self):
        params = dict(short=10, long=60, capital=200000, fee_bps=10, slippage_bps=10)
        result = self.a.execute_tool('run_backtest', {}, {**self.context, **params})
        self.assertEqual(result['parameters'], params)
        self.assertAlmostEqual(result['metrics']['return'], -.1683, places=4)
        override = self.a.execute_tool('run_backtest', {'fee_bps':0}, {**self.context, **params})
        self.assertEqual(override['parameters'], {**params, 'fee_bps':0})

    def test_malformed_model_arguments_stop_safely(self):
        call = {'role':'assistant','content':None,'tool_calls':[{'id':'a','function':{'name':'get_history','arguments':'['}}]}
        with patch.dict('os.environ', {'DEEPSEEK_API_KEY':'x'}), patch.object(self.a,'completion',return_value=call):
            with self.assertRaises(ValueError):
                self.a.chat('查询', self.context)

    def test_tool_loop_has_a_hard_limit(self):
        call = {'role':'assistant','content':None,'tool_calls':[{'id':'a','function':{'name':'get_history','arguments':'{}'}}]}
        with patch.dict('os.environ', {'DEEPSEEK_API_KEY':'x'}), patch.object(self.a,'completion',return_value=call):
            with self.assertRaisesRegex(ValueError, '上限'):
                self.a.chat('查询', self.context)

    def test_demo_is_explicitly_non_ai_and_based_on_real_data(self):
        r = self.a.demo(self.context)
        self.assertEqual(r['kind'],'rule')
        self.assertIn('非 AI', r['answer'])
        self.assertGreater(len(r['evidence']),0)


if __name__ == '__main__':
    unittest.main()
