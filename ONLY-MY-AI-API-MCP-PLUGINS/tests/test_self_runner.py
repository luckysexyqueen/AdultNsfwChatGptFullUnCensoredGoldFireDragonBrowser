import importlib.util, pathlib, tempfile, unittest, json
P=pathlib.Path(__file__).resolve().parents[1]/'tools'/'self_runner.py'
spec=importlib.util.spec_from_file_location('self_runner',P)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_health_rejects_remote(self):
  with self.assertRaises(ValueError): m.safe_health('https://example.com/health')
 def test_spec_change(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);a=m.spec_snapshot(p);(p/'spec.yaml').write_text('openapi: 3.1.0');self.assertNotEqual(a,m.spec_snapshot(p))
 def test_preview(self):
  self.assertEqual(m.main(['--dry-run','--command','python','-V']),0)
 def test_log(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'events.jsonl';m.write_event(p,'test',ok=True);self.assertTrue(json.loads(p.read_text())['ok'])
if __name__=='__main__':unittest.main()
