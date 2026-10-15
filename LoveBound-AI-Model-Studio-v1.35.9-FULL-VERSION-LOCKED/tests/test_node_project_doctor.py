import unittest,tempfile,pathlib,json,sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
from node_project_doctor import audit
class DoctorTest(unittest.TestCase):
 def test_missing_lock(self):
  with tempfile.TemporaryDirectory() as t:
   p=pathlib.Path(t);(p/'package.json').write_text(json.dumps({'name':'test','scripts':{'build':'vite build'}}))
   self.assertIn('no lockfile',audit(p)['issues'])
 def test_native_hint(self):
  with tempfile.TemporaryDirectory() as t:
   p=pathlib.Path(t);(p/'package.json').write_text(json.dumps({'dependencies':{'sharp':'1.0'}}));(p/'package-lock.json').write_text('{}')
   self.assertEqual(audit(p)['native_addon_hints'],['sharp'])
if __name__=='__main__':unittest.main()
