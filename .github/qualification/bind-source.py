"""Record Git-bound checkout payloads before and after owned hosted qualification."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

assert os.environ.get('GITHUB_ACTIONS') == 'true'
assert sys.argv[1:] in (['before'], ['after'])
root = Path(__file__).resolve().parents[2]
if os.environ.get('RUNNER_TEMP') != '/Users/runner/work/_temp':
    raise RuntimeError('Only the reviewed disposable macOS runner temp root is allowed')
out = Path('/Users/runner/work/_temp/room-scanning-source-binding')
out.mkdir(exist_ok=True)
records = {}
for entry in subprocess.check_output(['git', 'ls-files', '-s', '-z'], cwd=root).split(b'\0'):
    if not entry:
        continue
    header, raw_path = entry.split(b'\t', 1)
    mode, blob, stage = header.decode().split()
    assert stage == '0' and mode in ('100644', '100755')
    path = raw_path.decode('utf-8')
    payload = (root / path).read_bytes()
    actual = hashlib.sha1(b'blob ' + str(len(payload)).encode() + b'\0' + payload).hexdigest()
    assert actual == blob, 'Tracked input differs from Git: ' + path
    records[path] = {'blob': blob, 'sha256': hashlib.sha256(payload).hexdigest()}
if sys.argv[1] == 'after':
    assert records == json.loads((out / 'source-before.json').read_text()), 'Tracked inputs changed during qualification'
(out / ('source-' + sys.argv[1] + '.json')).write_text(json.dumps(records, indent=2) + '\n')
print(json.dumps({'phase': sys.argv[1], 'Git_bound_source_payloads': len(records)}))
