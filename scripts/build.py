"""Build deterministic local release archives; never read a Thunderbird profile."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
CARDS = [
    'manifest.json', 'avatars.js', 'background.js', 'options.html', 'options.js',
    'experiment/api.js', 'experiment/cards.js', 'experiment/cards.css',
    'experiment/tags.js', 'experiment/threads.js', 'experiment/schema.json',
    'styles/interface.css', 'styles/content.css',
    '_locales/en/messages.json', '_locales/ru/messages.json', 'LICENSE',
]


def archive(destination, base, names):
    with ZipFile(destination, 'w', compression=ZIP_DEFLATED, compresslevel=9) as output:
        for name in sorted(names):
            source = base / (names[name] if isinstance(names, dict) else name)
            if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(base.resolve()):
                raise ValueError(f'Unsafe or missing source: {name}')
            info = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = ZIP_DEFLATED
            output.writestr(info, source.read_bytes(), compresslevel=9)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    cards_version = json.loads((ROOT / 'lime-mail-cards/manifest.json').read_text())['version']
    theme_version = json.loads((ROOT / 'milk-lime/manifest.json').read_text())['version']
    sources = ['README.md', 'README.ru.md', 'LICENSE', '.gitignore']
    for directory in ['lime-mail-cards', 'milk-lime', 'scripts', 'tests', 'docs']:
        sources.extend(str(file.relative_to(ROOT)) for file in (ROOT / directory).rglob('*')
                       if file.is_file() and (file.suffix in {'.js', '.cjs', '.json', '.html', '.css', '.md', '.py'} or file.name == 'LICENSE'))
    sources.extend(str(file.relative_to(ROOT)) for file in (ROOT / 'docs/screenshots').glob('*.png'))
    packages = [
        (f'lime-mail-cards-{cards_version}.xpi', ROOT / 'lime-mail-cards', CARDS),
        (f'milk-lime-theme-{theme_version}.xpi', ROOT / 'milk-lime', ['manifest.json', 'LICENSE', '_locales/en/messages.json', '_locales/ru/messages.json']),
        (f'milk-lime-source-{cards_version}.zip', ROOT, sources),
    ]
    sums = []
    for name, base, files in packages:
        target = args.output / name
        if target.is_symlink():
            raise ValueError(f'Refusing symlink output: {target}')
        archive(target, base, files)
        sums.append(f'{hashlib.sha256(target.read_bytes()).hexdigest()}  {name}\n')
        print(name)
    checksums = args.output / 'SHA256SUMS'
    if checksums.is_symlink():
        raise ValueError('Refusing symlink checksum output')
    checksums.write_text(''.join(sums), encoding='utf-8')


if __name__ == '__main__':
    main()
