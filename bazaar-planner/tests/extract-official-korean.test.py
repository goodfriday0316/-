# Authored synthetic databases only; no game localization strings included.
import importlib.util,tempfile,pathlib,sqlite3,json,hashlib,zipfile,unittest
spec=importlib.util.spec_from_file_location('m',pathlib.Path(__file__).resolve().parents[1]/'tools'/'extract_official_korean.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
ID='11111111-1111-4111-8111-111111111111';ID2='22222222-2222-4222-8222-222222222222'
class ExtractTests(unittest.TestCase):
 def fixture(self,d,keys=None):
  d=pathlib.Path(d);g=d/'GameData.db';l=d/'ko-KR.bytes';t=d/'templates.sqlite3'
  with sqlite3.connect(g) as c:
   c.execute('CREATE TABLE cards(Id,Data)');c.execute('INSERT INTO cards VALUES(?,?)',(ID,json.dumps({'Id':ID,'Type':'Item','Localization':{'Title':{'Key':'exact-key','Text':'Synthetic'}}})))
  with sqlite3.connect(l) as c:
   c.execute('CREATE TABLE translation(hash,text)');c.executemany('INSERT INTO translation VALUES(?,?)',keys or [('exact-key','공식 테스트')])
  with sqlite3.connect(t) as c:c.execute('CREATE TABLE templates(template_id,name)');c.executemany('INSERT INTO templates VALUES(?,?)',[(ID,'Synthetic'),(ID2,'Missing')])
  return g,l,t
 def test_exact_join_and_readonly(self):
  with tempfile.TemporaryDirectory() as d:
   g,l,t=self.fixture(d);before=[m.sha256(p) for p in (g,l,t)];data,r=m.extract_names(g,l,t)
   self.assertEqual(data['records'][0]['nameKo'],'공식 테스트');self.assertEqual(data['records'][0]['templateId'],ID)
   self.assertEqual((r['matchedCount'],r['unconfirmedCount']),(1,1));self.assertEqual(r['missingGameItemIds'],[ID2]);self.assertEqual(before,[m.sha256(p) for p in (g,l,t)])
 def test_duplicate_key_not_guessed(self):
  with tempfile.TemporaryDirectory() as d:
   g,l,t=self.fixture(d,[('exact-key','하나'),('exact-key','둘')]);data,r=m.extract_names(g,l,t)
   self.assertEqual(data['records'],[]);self.assertEqual(r['duplicateTranslationKeys'],['exact-key'])
 def test_hash_not_derived_from_english(self):
  with tempfile.TemporaryDirectory() as d:
   g,l,t=self.fixture(d,[('Synthetic','이름 유사성 금지')]);data,r=m.extract_names(g,l,t)
   self.assertEqual(data['records'],[]);self.assertEqual(len(r['missingKoreanKeys']),1)
 def test_mismatched_english_not_applied(self):
  with tempfile.TemporaryDirectory() as d:
   g,l,t=self.fixture(d)
   with sqlite3.connect(t) as c:c.execute('UPDATE templates SET name=? WHERE template_id=?',('Different',ID))
   data,r=m.extract_names(g,l,t);self.assertEqual(data['records'],[]);self.assertEqual(r['englishNameMismatches'],[ID])
 def test_zip_entry_and_traversal_rejection(self):
  with tempfile.TemporaryDirectory() as d:
   g,l,t=self.fixture(d);z=pathlib.Path(d)/'GameData.db.zip'
   with zipfile.ZipFile(z,'w') as a:a.write(g,'GameData.db')
   data,r=m.extract_names(z,l,t);self.assertEqual(r['matchedCount'],1)
   with zipfile.ZipFile(z,'w') as a:a.write(g,'../GameData.db')
   with self.assertRaises(ValueError):m.extract_names(z,l,t)
if __name__=='__main__':unittest.main()
