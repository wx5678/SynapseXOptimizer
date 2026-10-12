"""Read selected zlib-compressed PE blocks from cfc packages without executing or extracting them."""
import hashlib
import json
import pathlib
import sys
import zlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'state' / 'keybind-diff' / 'analysis-deps'))
import pefile

root = pathlib.Path(r'D:\game\游戏蜗牛\9yinjh\res')
name = sys.argv[1]
if name not in ('cfc.package', 'cfc64.package'):
    raise ValueError('Expected a cfc package')
source = root / name
content = source.read_bytes()
digest = hashlib.sha256(content).hexdigest()
for arg in sys.argv[2:]:
    offset = int(arg, 0)
    stream = zlib.decompressobj()
    block = stream.decompress(content[offset:]) + stream.flush()
    if not stream.eof or not block.startswith(b'MZ'):
        raise ValueError(f'No complete PE block at {offset}')
    pe = pefile.PE(data=block, fast_load=True)
    pe.parse_data_directories(directories=[
        pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_EXPORT'],
        pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_IMPORT'],
        pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_RESOURCE'],
    ])
    exports = getattr(pe, 'DIRECTORY_ENTRY_EXPORT', None)
    version = {}
    for item in getattr(pe, 'FileInfo', []):
        for entry in item:
            for table in getattr(entry, 'StringTable', []):
                version.update({k.decode(errors='replace'): v.decode(errors='replace') for k, v in table.entries.items()})
    imports = [e.dll.decode(errors='replace') for e in getattr(pe, 'DIRECTORY_ENTRY_IMPORT', [])]
    print(json.dumps({
        'package': name,
        'package_sha256': digest,
        'offset': offset,
        'pe_bytes': len(block),
        'pe_sha256': hashlib.sha256(block).hexdigest(),
        'machine': hex(pe.FILE_HEADER.Machine),
        'export_dll_name': exports.name.decode(errors='replace') if exports and exports.name else None,
        'version': {k: v for k, v in version.items() if k in ('OriginalFilename', 'FileDescription', 'ProductName')},
        'imports': imports[:25],
        'exports': [s.name.decode(errors='replace') for s in exports.symbols[:20] if s.name] if exports else [],
    }, ensure_ascii=False))
if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
    raise RuntimeError('Package changed during inspection')
