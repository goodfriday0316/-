"""Read-only Chronicle export. Python 3 standard library; never modifies inputs."""
import argparse, collections, hashlib, json, pathlib, sqlite3, uuid, zipfile

def convert(database, images=None):
    uri = pathlib.Path(database).resolve().as_uri() + '?mode=ro'
    with sqlite3.connect(uri, uri=True) as db:
        db.row_factory = sqlite3.Row
        rows = [dict(r) for r in db.execute('SELECT * FROM templates ORDER BY template_id')]
    items, errors = [], []
    for r in rows:
        try:
            ident = str(uuid.UUID(r['template_id']))
            if ident != r['template_id']: raise ValueError('noncanonical UUID')
            heroes = json.loads(r['heroes_json'])
            tags = json.loads(r['tags_json'])
            if not heroes or not all(h in ['Common','Neutral','Vanessa','Pygmalien','Dooley','Mak','Stelle','Jules','Karnok','Dragons'] for h in heroes): raise ValueError('unknown heroes')
            if r['size'] not in ['small','medium','large']: raise ValueError('unknown size')
            if not isinstance(tags,list) or not all(isinstance(t,str) for t in tags): raise ValueError('invalid tags')
            if not r['name'] or r['ignored'] not in [0,1]: raise ValueError('invalid metadata')
            basename = (r['image_path'] or '').replace('\\','/').rsplit('/',1)[-1]
            image_id = ident if basename == ident + '.webp' else None
            items.append(dict(id=ident,name=r['name'],heroes=heroes,size=r['size'],tags=tags,ignored=bool(r['ignored']),imageId=image_id))
        except (ValueError,TypeError,KeyError) as e:
            errors.append(dict(id=r.get('template_id'),reason=str(e)))
    report = dict(totalRecords=len(rows),registered=len(items),ignored=sum(i['ignored'] for i in items),verifiedImageIdentifiers=sum(bool(i['imageId']) for i in items),invalid=errors,activity='unknown',patch='unknown')
    if images:
        expected = {i['imageId'] for i in items if i['imageId']}
        seen, matched, failed = set(), set(), []
        with zipfile.ZipFile(images) as z:
            counts = collections.Counter(pathlib.PurePosixPath(i.filename).stem for i in z.infolist() if not i.is_dir() and pathlib.PurePosixPath(i.filename).suffix.lower()=='.webp')
            for info in z.infolist():
                if info.is_dir(): continue
                p=pathlib.PurePosixPath(info.filename)
                stem=p.stem
                if p.suffix.lower() != '.webp': continue
                if counts[stem] != 1 or p.is_absolute() or '..' in p.parts or '\\' in info.filename or stem in seen or stem not in expected or info.file_size > 5*1024*1024:
                    failed.append(info.filename); continue
                seen.add(stem)
                with z.open(info) as f: header=f.read(12)
                if header[:4]!=b'RIFF' or header[8:12]!=b'WEBP': failed.append(info.filename); continue
                # Read to EOF: zipfile verifies CRC; retain one entry at a time.
                with z.open(info) as f:
                    while f.read(1024*1024): pass
                matched.add(stem)
        report.update(matchedImages=len(matched),failedImages=len(failed),failedFiles=failed,itemsWithoutImages=len(items)-len(matched))
    return dict(format='bazaar-chronicle-metadata-v1',items=items), report

if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('database');p.add_argument('--images',help='optional items.zip for verified UUID/CRC report');p.add_argument('--output',default='chronicle-local.json')
    a=p.parse_args()
    output=pathlib.Path(a.output)
    if output.exists() or pathlib.Path(str(output)+'.report.json').exists(): p.error('output exists; choose another --output')
    if output.suffix.lower()!='.json': p.error('output must end in .json')
    data,report=convert(a.database,a.images)
    output.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
    pathlib.Path(str(output)+'.report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
