"""Split items.zip without changing it; verify CRC, write new ZIPs to a new folder."""
import argparse,pathlib,zipfile
p=argparse.ArgumentParser(description=__doc__);p.add_argument('zip');p.add_argument('output');p.add_argument('--mb',type=int,default=40);a=p.parse_args()
if not 5<=a.mb<=100:p.error('--mb must be 5..100')
out=pathlib.Path(a.output);out.mkdir(exist_ok=False)
with zipfile.ZipFile(a.zip) as source:
    target=None;size=0;part=0
    try:
        for info in source.infolist():
            path=pathlib.PurePosixPath(info.filename)
            if info.is_dir() or path.suffix.lower()!='.webp':continue
            if path.is_absolute() or '..' in path.parts or '\\' in info.filename:raise ValueError('unsafe path')
            if info.file_size>5*1024*1024:raise ValueError('image exceeds 5MB')
            data=source.read(info)
            if target is None or size+len(data)>a.mb*1024*1024:
                if target:target.close()
                part+=1;target=zipfile.ZipFile(out/f'items-part-{part:03}.zip','x',zipfile.ZIP_STORED);size=0
            target.writestr(info.filename,data);size+=len(data)
    finally:
        if target:target.close()
print(f'{part} ZIP parts written; original untouched')
