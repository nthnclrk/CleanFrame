"""Check source paths, known private font blobs and common credential patterns.

This is a bounded release check, not a licence or complete secret audit.
"""
from pathlib import Path
import hashlib
import json
import subprocess

from widget import ROOT
from private_files import private_path, secret_content


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def secret_blobs(ids):
    """Batch reads keep index/history scanning fast and never print blob data."""
    ids = sorted(set(ids))
    if not ids:
        return set()
    metadata = subprocess.check_output(['git', 'cat-file', '--batch-check'],
                                       input=('\n'.join(ids) + '\n').encode(), cwd=ROOT)
    # Gitlinks may refer to objects held only in another repository.
    blobs = []
    for line in metadata.splitlines():
        fields = line.split()
        if len(fields) == 3 and fields[1] == b'blob':
            blobs.append(fields[0].decode())
    ids = blobs
    if not ids:
        return set()
    output = subprocess.check_output(['git', 'cat-file', '--batch'],
                                     input=('\n'.join(ids) + '\n').encode(), cwd=ROOT)
    found = set()
    offset = 0
    for _ in ids:
        end = output.index(b'\n', offset)
        oid, kind, size = output[offset:end].split()
        offset = end + 1
        size = int(size)
        if secret_content(output[offset:offset + size]):
            found.add(oid.decode())
        offset += size + 1
    return found


candidates = set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').decode().split('\0')) - {''}
findings = []
font_suffixes = {'.ttf', '.otf', '.woff', '.woff2', '.eot'}


def forbidden(name):
    path = Path(name)
    return (name.startswith(('.local/', 'dist/', 'node_modules/', 'app/assets/private-fonts/',
                                    'explorations/', 'docs/research/', 'docs/articles/'))
            or private_path(name) or path.suffix.lower() in {'.wgt', '.dll', '.pdb', '.exe'}
            or any(part.lower() in {'bin', 'obj'} for part in path.parts)
            or (path.name.startswith('PP') and path.suffix.lower() in font_suffixes))


# The app uses the TV's system font and ships no font files: any font file is a finding.
public_fonts = {}

for name in sorted(candidates):
    if forbidden(name):
        findings.append('Private/generated source path: ' + name)
    path = ROOT / name
    if path.is_symlink():
        findings.append('Symlink in public source: ' + name)
        continue
    if not path.is_file():
        continue
    if path.suffix.lower() in font_suffixes:
        if name not in public_fonts or hashlib.sha256(path.read_bytes()).hexdigest() != public_fonts[name]:
            findings.append('Unrecognised or changed public font: ' + name)
    # Print filenames only, so a failing check does not leak a matched credential.
    if secret_content(path.read_bytes()):
        findings.append('Credential pattern: ' + name)

index = []
for entry in git('ls-files', '--stage', '-z').decode().split('\0'):
    if not entry:
        continue
    metadata, name = entry.split('\t', 1)
    mode, oid, stage = metadata.split()
    index.append((name, oid))
    if mode == '120000' or forbidden(name):
        findings.append('Private/generated or symlink path in Git index: ' + name)

history = set()
# rev-list --objects records only one path per object. A later rename could hide
# a private filename, so inspect each distinct committed tree with NUL records.
for tree in sorted(set(git('log', '--all', '--format=%T').decode().splitlines())):
    for entry in git('ls-tree', '-r', '-z', tree).decode().split('\0'):
        if not entry:
            continue
        metadata, name = entry.split('\t', 1)
        mode, kind, oid = metadata.split()
        if forbidden(name):
            findings.append('Private/generated path in reachable Git history: ' + name)
        if mode == '120000':
            findings.append('Symlink in reachable Git history: ' + name)
        if kind == 'blob':
            history.add((name, oid))

object_ids = {oid for _, oid in history}
unsafe_blobs = secret_blobs(object_ids | {oid for _, oid in index})
for name, oid in index:
    if oid in unsafe_blobs:
        findings.append('Credential pattern in Git index: ' + name)
for name, oid in history:
    if oid in unsafe_blobs:
        findings.append('Credential pattern in reachable Git history: ' + name)
private_root = ROOT / '.local/research/font-candidates'
private_fonts = [p for p in private_root.rglob('*') if p.is_file() and p.name.startswith('PP') and p.suffix.lower() in font_suffixes]
for path in private_fonts:
    if git('hash-object', str(path)).decode().strip() in object_ids:
        findings.append('Known proprietary font bytes in Git history: ' + path.name)


if findings:
    raise SystemExit('\n'.join(sorted(set(findings))[:20]) + '\nTotal findings: ' + str(len(set(findings))))
print('Public-source checks passed for ' + str(len(candidates)) + ' candidate files and reachable Git paths.')
print('Compared ' + str(len(private_fonts)) + ' local proprietary font files with reachable Git objects.')
if not private_fonts:
    print('No private fonts on this machine; known-font byte comparison was skipped.')
print('Also review third-party notices, full history, GitHub logs and release assets before publication.')
