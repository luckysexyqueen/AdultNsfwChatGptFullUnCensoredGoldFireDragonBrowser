import tempfile, pathlib, zipfile, unittest, sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
from dual_webview_plan import inspect
class TestPlan(unittest.TestCase):
 def test_detect_and_traversal(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'project.zip'
   with zipfile.ZipFile(p,'w') as z:
    z.writestr('app/GeckoViewPlugin.java','');z.writestr('app/WebViewClient.java','');z.writestr('../bad','')
   r=inspect(p)
   self.assertEqual(r['unsafe_paths'],['../bad'])
   self.assertTrue(r['indicators']['geckoview'])
   self.assertTrue(r['indicators']['chromium_webview'])
if __name__=='__main__':unittest.main()
