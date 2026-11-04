import importlib.util
import json
import threading
import unittest
import urllib.request
import urllib.error


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('server'), 'Local server not implemented')
        import server
        self.httpd = server.make_server(0)
        self.thread = threading.Thread(target=self.httpd.serve_forever,daemon=True)
        self.thread.start()
        self.base = 'http://127.0.0.1:' + str(self.httpd.server_port)

    def tearDown(self):
        if hasattr(self,'httpd'):
            self.httpd.shutdown()
            self.httpd.server_close()
            self.thread.join()

    def request(self,path,data=None,headers=None):
        headers = headers or {}
        if data is not None:
            headers.update({'Content-Type':'application/json','Origin':self.base})
        req = urllib.request.Request(self.base+path, data=None if data is None else json.dumps(data).encode(), headers=headers)
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, r.read().decode()
        except urllib.error.HTTPError as e:
            with e:
                return e.code,e.read().decode()

    def test_status_is_safe_and_static_files_are_allowlisted(self):
        status, body = self.request('/api/status')
        self.assertEqual(status,200)
        self.assertNotIn('api_key',body.lower())
        self.assertIn('configured',body)
        for path in ['/../server.py','/data/samples.json','/.env','/server.py']:
            self.assertEqual(self.request(path)[0],404)

    def test_blocks_untrusted_host_and_origin(self):
        self.assertEqual(self.request('/api/status',headers={'Host':'evil.example'})[0],403)
        req = urllib.request.Request(self.base+'/api/history',data=b'{}',headers={'Origin':'https://evil.example','Content-Type':'application/json'})
        with self.assertRaises(urllib.error.HTTPError) as result:
            urllib.request.urlopen(req)
        self.assertEqual(result.exception.code,403)
        result.exception.close()

    def test_sample_history_and_invalid_payload(self):
        status,body = self.request('/api/history',{'symbol':'600519','mode':'sample','start':'2024-01-01','end':'2024-12-31'})
        self.assertEqual(status,200)
        self.assertGreater(len(json.loads(body)['bars']),200)
        self.assertEqual(self.request('/api/history',{'symbol':'../../.env'})[0],400)
        self.assertEqual(self.request('/api/history',[])[0],400)


if __name__ == '__main__':
    unittest.main()
