import unittest,tempfile,pathlib,zipfile,sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from project_readiness import inspect
class TestReadiness(unittest.TestCase):
 def test_gguf(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/"x.gguf";p.write_bytes(b"GGUF"+(3).to_bytes(4,"little")+b"test")
   self.assertEqual(inspect(p)["header_version"],3)
 def test_zip_traversal(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/"x.zip"
   with zipfile.ZipFile(p,"w") as z:z.writestr("../escape.txt","x");z.writestr("site/package.json","{}")
   x=inspect(p)
   self.assertEqual(x["unsafe_paths"],1)
   self.assertIn("package.json",x["website_hints"])
if __name__=="__main__":unittest.main()
