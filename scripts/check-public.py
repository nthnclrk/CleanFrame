"""Check working files, staged blobs and reachable history for private material.

This is a bounded release check, not a licence or complete secret audit.
Diagnostics identify paths or object hashes, never matched credentials.
"""
from pathlib import Path
import hashlib
import json
import subprocess

from font_assets import ROOT

from source_policy import CREDENTIAL_PATTERNS, FONT_SUFFIXES, is_private_path


def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root)


def tree_entries(data):
    """Parse Git's NUL-delimited format, including paths with whitespace."""
    for record in data.split(b'\0'):
        if not record:
            continue
        metadata, name = record.split(b'\t', 1)
        mode, kind, object_id = metadata.decode().split()
        yield mode, kind, object_id, name.decode('utf-8', errors='surrogateescape')


def read_objects(root, object_ids):
    """Read each referenced blob once through one Git process."""
    process = subprocess.Popen(['git', 'cat-file', '--batch'], cwd=root,
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        for object_id in sorted(object_ids):
            process.stdin.write(object_id.encode() + b'\n')
            process.stdin.flush()
            header = process.stdout.readline().split()
            if len(header) != 3 or header[1] != b'blob':
                raise ValueError('Could not inspect a Git blob')
            data = process.stdout.read(int(header[2]))
            if len(data) != int(header[2]) or process.stdout.read(1) != b'\n':
                raise ValueError('Incomplete Git blob')
            yield object_id, data
    finally:
        process.stdin.close()
        process.stdout.close()
        if process.wait(timeout=10):
            raise ValueError('Git blob inspection failed')


def inspect(root):
    findings = set()
    candidates = set(git(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z')
                     .decode('utf-8', errors='surrogateescape').split('\0')) - {''}
    public_fonts = {'app/assets/manrope.woff2': 'e310b55a7fd9677f5e3555e6c6c4d064fa1f1d24393f0ddbe217cea12a8c432f'}
    for record in json.loads((root / 'app/assets/fonts/SOURCES.json').read_text()):
        if Path(record['file']).suffix.lower() in FONT_SUFFIXES:
            public_fonts['app/assets/fonts/' + record['file']] = record['sha256']

    def inspect_bytes(name, data, validate_font=False):
        if any(pattern.search(data) for pattern in CREDENTIAL_PATTERNS):
            findings.add('Credential pattern: ' + name)
        if validate_font and Path(name).suffix.lower() in FONT_SUFFIXES:
            if hashlib.sha256(data).hexdigest() != public_fonts.get(name):
                findings.add('Unrecognised or changed public font: ' + name)

    for name in sorted(candidates):
        if is_private_path(name):
            findings.add('Private/generated source path: ' + name)
        path = root / name
        if path.is_symlink():
            findings.add('Symlink in public source: ' + name)
        elif path.is_file():
            inspect_bytes(name, path.read_bytes(), validate_font=True)

    # Working files can differ from the actual contents being committed.
    staged = {}
    for record in git(root, 'ls-files', '--stage', '-z').split(b'\0'):
        if not record:
            continue
        metadata, raw_name = record.split(b'\t', 1)
        mode, object_id, stage = metadata.decode().split()
        name = raw_name.decode('utf-8', errors='surrogateescape')
        if stage != '0':
            findings.add('Unresolved staged file: ' + name)
        if is_private_path(name):
            findings.add('Private/generated source path: ' + name)
        if mode == '120000':
            findings.add('Symlink in staged source: ' + name)
        if mode in {'100644', '100755', '120000'}:
            staged.setdefault(object_id, []).append(name)

    # Inspect every distinct committed tree: a blob's first name alone can miss
    # a later rename to a private path. NUL-delimited trees preserve exact paths.
    historical = {}
    trees = set(git(root, 'log', '--all', '--format=%T').decode().splitlines())
    for tree in sorted(trees):
        for mode, kind, object_id, name in tree_entries(git(root, 'ls-tree', '-r', '-z', tree)):
            if is_private_path(name):
                findings.add('Private/generated path in reachable Git history: ' + name)
            if mode == '120000':
                findings.add('Symlink in reachable Git history: ' + name)
            if kind == 'blob':
                historical.setdefault(object_id, set()).add(name)
    for object_id, data in read_objects(root, set(staged) | set(historical)):
        for name in staged.get(object_id, []):
            inspect_bytes(name, data, validate_font=True)
        if object_id in historical and any(pattern.search(data) for pattern in CREDENTIAL_PATTERNS):
            # A short hash is enough to locate the commit without exposing bytes.
            findings.add('Credential pattern in reachable Git history: blob ' + object_id[:12])

    private_root = root / '.local/research/font-candidates'
    private_fonts = [p for p in private_root.rglob('*') if p.is_file()
                     and p.name.startswith('PP') and p.suffix.lower() in FONT_SUFFIXES]
    for path in private_fonts:
        if git(root, 'hash-object', str(path)).decode().strip() in historical:
            findings.add('Known proprietary font bytes in Git history: ' + path.name)
    for name in ['app/assets/fonts/geist/OFL.txt', 'app/assets/fonts/newsreader/OFL.txt', 'app/assets/manrope-OFL.txt']:
        if not (root / name).is_file():
            findings.add('Missing public font licence: ' + name)
    return findings, len(candidates), len(private_fonts)


def main():
    findings, files, fonts = inspect(ROOT)
    if findings:
        raise SystemExit('\n'.join(sorted(findings)[:20]) + '\nTotal findings: ' + str(len(findings)))
    print('Public-source checks passed for ' + str(files) + ' candidate files, staged blobs and reachable Git history.')
    print('Compared ' + str(fonts) + ' local proprietary font files with reachable Git objects.')
    if not fonts:
        print('No private fonts on this machine; known-font byte comparison was skipped.')
    print('Also review third-party notices, GitHub logs and release assets before publication.')


if __name__ == '__main__':
    main()
