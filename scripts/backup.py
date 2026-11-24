#!/usr/bin/env python3
"""Private, off-volume daily SQLite + referenced media snapshots.
No web endpoint, no credentials in archives/logs. Restore only to an empty directory."""
import os, sys, time, sqlite3, pathlib, tempfile, tarfile, hashlib, json, datetime, shutil, re
from contextlib import closing

PREFIX = 'viewly-staging/v1/'
KEEP = 7
MEDIA = [('releases','file_name'),('releases','cover_name'),('clips','file_name'),('campaign_assets','storage_name')]
def digest(p):
    with open(p,'rb') as f: return hashlib.file_digest(f,'sha256').hexdigest()
def check_db(db):
    if db.execute('PRAGMA quick_check').fetchall() != [('ok',)]: raise ValueError('SQLite integrity check failed')
    if db.execute('PRAGMA foreign_key_check').fetchone(): raise ValueError('SQLite foreign-key check failed')
def referenced(db):
    out=set()
    for table,col in MEDIA:
        if not db.execute('SELECT 1 FROM sqlite_master WHERE type=? AND name=?',('table',table)).fetchone(): continue
        for (name,) in db.execute(f'SELECT {col} FROM {table} WHERE {col} IS NOT NULL AND {col}<>?',('',)):
            if not re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9]+',name): raise ValueError('Invalid media filename')
            out.add(name)
    return out
def build(data,uploads,archive):
    with tempfile.TemporaryDirectory(prefix='viewly-snapshot-') as work:
        root=pathlib.Path(work)
        (root/'data').mkdir(); (root/'uploads').mkdir()
        target=root/'data/viewly.sqlite'
        source=pathlib.Path(data)/'viewly.sqlite'
        if not source.is_file(): raise ValueError('Database not initialized')
        with closing(sqlite3.connect(source.resolve().as_uri()+'?mode=ro',uri=True,timeout=20)) as src, closing(sqlite3.connect(target)) as dst:
            src.backup(dst,pages=128,sleep=.05)
            check_db(dst)
            names=referenced(dst)
        for name in sorted(names):
            p=pathlib.Path(uploads)/name
            if p.is_symlink() or not p.is_file(): raise ValueError('Referenced media missing')
            shutil.copyfile(p,root/'uploads'/name)
        files={str(p.relative_to(root)):digest(p) for p in root.rglob('*') if p.is_file()}
        (root/'manifest.json').write_text(json.dumps({'format':1,'files':files},sort_keys=True))
        with tarfile.open(archive,'w:gz',compresslevel=3) as tar:
            for name in sorted([*files,'manifest.json']): tar.add(root/name,arcname=name,recursive=False)
        return len(files)-1
def restore(archive,destination):
    dest=pathlib.Path(destination)
    if dest.exists() and (not dest.is_dir() or any(dest.iterdir())): raise ValueError('Restore destination must be empty')
    dest.mkdir(parents=True,exist_ok=True,mode=0o700)
    seen=set()
    with tarfile.open(archive,'r:gz') as tar:
        for member in tar:
            name=member.name
            if not member.isfile() or name in seen or not (name in ['manifest.json','data/viewly.sqlite'] or re.fullmatch(r'uploads/[A-Za-z0-9_-]+\.[A-Za-z0-9]+',name)):
                raise ValueError('Unsafe archive member')
            seen.add(name)
            target=dest/name
            target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            with tar.extractfile(member) as src, target.open('xb') as dst: shutil.copyfileobj(src,dst)
            target.chmod(0o600)
    manifest=json.loads((dest/'manifest.json').read_text())
    if manifest['format']!=1 or set(manifest['files'])!=seen-{'manifest.json'}: raise ValueError('Invalid manifest')
    for name,expected in manifest['files'].items():
        if digest(dest/name)!=expected: raise ValueError('File checksum mismatch')
    with closing(sqlite3.connect((dest/'data/viewly.sqlite').resolve().as_uri()+'?mode=ro',uri=True)) as db:
        check_db(db)
        if {'uploads/'+n for n in referenced(db)} != seen-{'manifest.json','data/viewly.sqlite'}: raise ValueError('Missing media in backup')
    return len(manifest['files'])-1
def client():
    import boto3
    from botocore.config import Config
    endpoint=os.environ['VIEWLY_BACKUP_ENDPOINT']
    if not endpoint.startswith('https://'): raise ValueError('Backup endpoint must use TLS')
    return boto3.client('s3',endpoint_url=endpoint,region_name=os.environ.get('VIEWLY_BACKUP_REGION','auto'),
        aws_access_key_id=os.environ['VIEWLY_BACKUP_ACCESS_KEY'],aws_secret_access_key=os.environ['VIEWLY_BACKUP_SECRET_KEY'],
        config=Config(signature_version='s3v4',s3={'addressing_style':'virtual'},connect_timeout=10,read_timeout=90,retries={'max_attempts':3}))
def objects(s3,bucket):
    out=[]
    for page in s3.get_paginator('list_objects_v2').paginate(Bucket=bucket,Prefix=PREFIX):
        out.extend(x for x in page.get('Contents',[]) if re.fullmatch(PREFIX+r'\d{8}T\d{6}Z\.tar\.gz',x['Key']))
    return sorted(out,key=lambda x:x['Key'],reverse=True)
def run():
    s3=client(); bucket=os.environ['VIEWLY_BACKUP_BUCKET']
    previous=objects(s3,bucket)
    now=datetime.datetime.now(datetime.timezone.utc)
    if previous and (now-previous[0]['LastModified']).total_seconds()<23*3600: return
    with tempfile.TemporaryDirectory(prefix='viewly-backup-') as tmp:
        archive=pathlib.Path(tmp)/'snapshot.tar.gz'
        count=build(os.environ['VIEWLY_DATA_DIR'],os.environ['VIEWLY_UPLOAD_DIR'],archive)
        restore(archive,pathlib.Path(tmp)/'restore-check')
        checksum=digest(archive)
        key=PREFIX+now.strftime('%Y%m%dT%H%M%SZ')+'.tar.gz'
        s3.upload_file(str(archive),bucket,key,ExtraArgs={'Metadata':{'sha256':checksum},'ContentType':'application/gzip'})
        remote=s3.get_object(Bucket=bucket,Key=key)
        h=hashlib.sha256()
        with closing(remote['Body']) as body:
            for chunk in body.iter_chunks(chunk_size=1024*1024): h.update(chunk)
        if h.hexdigest()!=checksum or remote['Metadata'].get('sha256')!=checksum:
            s3.delete_object(Bucket=bucket,Key=key)
            raise ValueError('Remote backup checksum mismatch')
        print(f'VIEWLY BACKUP VERIFIED media={count} bytes={archive.stat().st_size} restore=ok',flush=True)
    # Never prune until the newest copy has passed local restore and remote verification.
    for entry in objects(s3,bucket)[KEEP:]: s3.delete_object(Bucket=bucket,Key=entry['Key'])
def self_test():
    with tempfile.TemporaryDirectory() as d:
        p=pathlib.Path(d); (p/'data').mkdir(); (p/'uploads').mkdir()
        with closing(sqlite3.connect(p/'data/viewly.sqlite')) as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE releases(file_name TEXT,cover_name TEXT)')
            db.execute("INSERT INTO releases VALUES('sample.mp4',NULL)")
            db.commit()
            (p/'uploads/sample.mp4').write_bytes(b'fixture-media')
            build(p/'data',p/'uploads',p/'snapshot.tar.gz')
            assert restore(p/'snapshot.tar.gz',p/'restored')==1
            assert (p/'restored/uploads/sample.mp4').read_bytes()==b'fixture-media'
            with closing(sqlite3.connect(p/'restored/data/viewly.sqlite')) as restored:
                assert restored.execute('SELECT file_name FROM releases').fetchone()==('sample.mp4',)
            (p/'uploads/sample.mp4').unlink()
            try: build(p/'data',p/'uploads',p/'bad.tar.gz')
            except ValueError: pass
            else: raise AssertionError('Missing media accepted')
    print('VIEWLY backup/restore self-test passed')
if __name__=='__main__':
    os.umask(0o077)
    action=sys.argv[1] if len(sys.argv)>1 else 'loop'
    if action=='self-test': self_test()
    elif action=='restore':
        if len(sys.argv)!=4: raise SystemExit('usage: backup.py restore ARCHIVE EMPTY_DIRECTORY')
        print(f'Verified restore, media={restore(sys.argv[2],sys.argv[3])}')
    elif action=='once': run()
    elif action=='loop':
        time.sleep(20)
        while True:
            try: run()
            except Exception as exc: print('VIEWLY BACKUP FAILED '+type(exc).__name__,file=sys.stderr,flush=True)
            time.sleep(3600)
    else: raise SystemExit('Unknown backup command')
