import importlib.util, pathlib, sqlite3, tempfile, unittest, zipfile, hashlib, json
spec=importlib.util.spec_from_file_location('converter',pathlib.Path(__file__).parents[1]/'tools/convert_chronicle.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Conversion(unittest.TestCase):
 def test_readonly_metadata_and_uuid_match(self):
  with tempfile.TemporaryDirectory() as d:
   db=pathlib.Path(d)/'templates.sqlite3';ident='11111111-1111-4111-8111-111111111111'
   with sqlite3.connect(db) as c:
    c.execute('create table templates(template_id,name,heroes_json,size,tags_json,art_key,image_path,ignored)')
    c.execute('insert into templates values(?,?,?,?,?,?,?,?)',(ident,'Synthetic','["Common"]','medium','[]','different-art',f'C:\\private\\{ident}.webp',1))
   before=hashlib.sha256(db.read_bytes()).digest()
   z=pathlib.Path(d)/'items.zip'
   with zipfile.ZipFile(z,'w') as f:
    f.writestr(f'items/{ident}.webp',b'RIFF\0\0\0\0WEBPsynthetic')
    f.writestr('unknown.webp',b'bad')
   data,report=m.convert(db,z)
   self.assertEqual(data['items'][0]['imageId'],ident)
   self.assertTrue(data['items'][0]['ignored'])
   self.assertEqual((report['matchedImages'],report['failedImages'],report['itemsWithoutImages']),(1,1,0))
   self.assertEqual(before,hashlib.sha256(db.read_bytes()).digest())
   self.assertNotIn('private',json.dumps(data))
 def test_wrong_filename_is_not_inferred_from_art_key_or_id(self):
  with tempfile.TemporaryDirectory() as d:
   db=pathlib.Path(d)/'templates.sqlite3';ident='11111111-1111-4111-8111-111111111111'
   with sqlite3.connect(db) as c:
    c.execute('create table templates(template_id,name,heroes_json,size,tags_json,art_key,image_path,ignored)')
    c.execute('insert into templates values(?,?,?,?,?,?,?,?)',(ident,'Synthetic','["Vanessa"]','small','[]',ident,'other.webp',0))
   data,report=m.convert(db)
   self.assertIsNone(data['items'][0]['imageId']);self.assertEqual(report['verifiedImageIdentifiers'],0)
if __name__=='__main__':unittest.main()
