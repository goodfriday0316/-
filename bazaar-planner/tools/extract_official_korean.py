"""Join local official Korean strings to exact game item IDs, without network access.

Inputs are read-only. This does not establish a redistribution license or verify that
someone has not modified a game file. Use the unmodified files from your own game.
"""
import argparse
import collections
import hashlib
import json
import pathlib
import sqlite3
import tempfile
import uuid
import zipfile
from contextlib import contextmanager

MAX_DATABASE_BYTES = 1024 * 1024 * 1024


def sha256(path):
    digest = hashlib.sha256()
    with pathlib.Path(path).open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


@contextmanager
def readonly_database(path):
    path = pathlib.Path(path).resolve(strict=True)
    connection = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
    try:
        connection.execute('PRAGMA query_only=ON')
        if connection.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise ValueError('SQLite integrity check failed: ' + path.name)
        yield connection
    finally:
        connection.close()


def require_columns(connection, table, required):
    # Table identifiers are constants, never supplied by a source database.
    columns = {row[1].lower() for row in connection.execute('PRAGMA table_info("' + table + '")')}
    if not set(required).issubset(columns):
        raise ValueError('Unsupported SQLite schema: ' + table + ' requires ' + ', '.join(required))


@contextmanager
def game_database(path):
    path = pathlib.Path(path).resolve(strict=True)
    if path.suffix.lower() != '.zip':
        yield path
        return
    with zipfile.ZipFile(path) as archive:
        candidates = [entry for entry in archive.infolist()
                      if not entry.is_dir() and pathlib.PurePosixPath(entry.filename).name == 'GameData.db']
        if len(candidates) != 1 or candidates[0].filename != 'GameData.db':
            raise ValueError('ZIP must contain exactly one root GameData.db entry.')
        entry = candidates[0]
        if entry.flag_bits & 1 or not 0 < entry.file_size <= MAX_DATABASE_BYTES:
            raise ValueError('Encrypted, empty, or oversized GameData.db is unsupported.')
        with tempfile.TemporaryDirectory(prefix='bazaar-ko-read-') as temporary:
            target = pathlib.Path(temporary) / 'GameData.db'
            total = 0
            with archive.open(entry) as source, target.open('xb') as destination:
                for block in iter(lambda: source.read(1024 * 1024), b''):
                    total += len(block)
                    if total > MAX_DATABASE_BYTES:
                        raise ValueError('GameData.db exceeds the extraction size limit.')
                    destination.write(block)
            # ZipFile.open verifies the expected CRC when the entry reaches EOF.
            yield target


def canonical_id(value):
    if not isinstance(value, str) or str(uuid.UUID(value)) != value:
        raise ValueError('Item ID is not a canonical UUID.')
    return value


def text(value, maximum=300):
    return isinstance(value, str) and bool(value.strip()) and len(value) <= maximum and not any(ord(c) < 32 for c in value)


def extract_names(game, locale, templates=None):
    locale = pathlib.Path(locale).resolve(strict=True)
    if locale.name.lower() != 'ko-kr.bytes':
        raise ValueError('Use the unmodified official ko-KR.bytes file, not another locale.')
    report = {
        'format': 'bazaar-korean-extraction-report-v1',
        'sourceFiles': {'gameData': pathlib.Path(game).name, 'locale': locale.name},
        'localeSHA256': sha256(locale),
        'gameSHA256': sha256(game),
        'catalogCount': None,
        'gameItemRecords': 0,
        'matchedCount': 0,
        'unconfirmedCount': 0,
        'duplicateTranslationKeys': [],
        'duplicateItemIds': [],
        'missingTitleKeys': [],
        'missingKoreanKeys': [],
        'invalidRecords': [],
        'englishNameMismatches': [],
        'missingGameItemIds': [],
        'unknownGameItemCount': 0,
        'notes': [
            'Exact join only: cards.Id = card.Id, Localization.Title.Key = translation.hash.',
            'No key hashing, fuzzy name matching, machine translation, or redistribution permission is inferred.',
            'SHA-256 records the supplied file; it does not authenticate its origin or official status.',
        ],
    }
    translations = {}
    duplicate_keys = set()
    with readonly_database(locale) as connection:
        require_columns(connection, 'translation', ['hash', 'text'])
        for key, name in connection.execute('SELECT hash, text FROM translation'):
            if not text(key, 1000):
                continue
            if key in translations:
                duplicate_keys.add(key)
            translations[key] = name
    for key in duplicate_keys:
        translations.pop(key, None)
    report['duplicateTranslationKeys'] = sorted(duplicate_keys)

    catalog = None
    if templates:
        catalog = {}
        with readonly_database(templates) as connection:
            require_columns(connection, 'templates', ['template_id', 'name'])
            for ident, name in connection.execute('SELECT template_id, name FROM templates'):
                canonical_id(ident)
                if ident in catalog or not text(name):
                    raise ValueError('Duplicate ID or invalid English name in templates.sqlite3.')
                catalog[ident] = name.strip()
        report['catalogCount'] = len(catalog)

    candidates = collections.defaultdict(list)
    with game_database(game) as database, readonly_database(database) as connection:
        require_columns(connection, 'cards', ['id', 'data'])
        for row_id, data in connection.execute('SELECT Id, Data FROM cards'):
            try:
                if isinstance(data, bytes):
                    data = data.decode('utf-8-sig')
                card = json.loads(data)
                if not isinstance(card, dict):
                    raise ValueError('Card JSON must be an object.')
                if card.get('Type') != 'Item':
                    continue
                report['gameItemRecords'] += 1
                ident = canonical_id(card.get('Id'))
                if row_id != ident:
                    raise ValueError('SQLite row Id differs from card.Id.')
                if catalog is not None and ident not in catalog:
                    report['unknownGameItemCount'] += 1
                    continue
                candidates[ident].append(card)
            except (ValueError, TypeError, UnicodeError) as error:
                report['invalidRecords'].append({'id': str(row_id)[:250], 'reason': str(error)[:300]})

    records = []
    for ident, cards in sorted(candidates.items()):
        if len(cards) != 1:
            report['duplicateItemIds'].append(ident)
            continue
        card = cards[0]
        localization = card.get('Localization')
        title = localization.get('Title') if isinstance(localization, dict) else None
        if not isinstance(title, dict) or not text(title.get('Key'), 1000):
            report['missingTitleKeys'].append(ident)
            continue
        name_en = title.get('Text')
        if not text(name_en):
            report['invalidRecords'].append({'id': ident, 'reason': 'Missing exact English Title.Text.'})
            continue
        name_en = name_en.strip()
        if catalog is not None and catalog[ident] != name_en:
            report['englishNameMismatches'].append(ident)
            continue
        key = title['Key']
        name_ko = translations.get(key)
        if not text(name_ko) or name_ko.strip() == name_en:
            report['missingKoreanKeys'].append({'templateId': ident, 'key': key})
            continue
        records.append({
            'templateId': ident,
            'nameEn': name_en,
            'nameKo': name_ko.strip(),
            'koreanProvenance': {
                'kind': 'official-game-localization',
                'source': locale.name,
                'key': key,
                'sourceSHA256': report['localeSHA256'],
            },
        })
    if catalog is not None:
        report['missingGameItemIds'] = sorted(set(catalog) - set(candidates))
    report['matchedCount'] = len(records)
    report['unconfirmedCount'] = (len(catalog) if catalog is not None else len(candidates)) - len(records)
    return {'format': 'bazaar-item-details-v1', 'records': records}, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('game_data', help='Local GameData.db or original GameData.db.zip')
    parser.add_argument('korean_locale', help='Local, unmodified translations/ko-KR.bytes')
    parser.add_argument('--templates', help='Optional templates.sqlite3 for exact ID and English name checks')
    parser.add_argument('--output', default='local-data/korean-names.json')
    args = parser.parse_args()
    output = pathlib.Path(args.output).resolve()
    report_path = pathlib.Path(str(output) + '.report.json')
    project = pathlib.Path(__file__).resolve().parents[1]
    for protected in ['src', 'public', 'dist']:
        if output.is_relative_to(project / protected):
            parser.error('Personal game names must not be written into src, public, or dist.')
    if output.suffix.lower() != '.json' or output.exists() or report_path.exists():
        parser.error('Choose a new .json output path; existing files are never overwritten.')
    try:
        result, report = extract_names(args.game_data, args.korean_locale, args.templates)
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open('x', encoding='utf-8') as destination:
            json.dump(result, destination, ensure_ascii=False, indent=2)
        with report_path.open('x', encoding='utf-8') as destination:
            json.dump(report, destination, ensure_ascii=False, indent=2)
    except (OSError, ValueError, sqlite3.Error, zipfile.BadZipFile) as error:
        parser.exit(1, str(error) + '\n')
    print('Matched:', report['matchedCount'], '/ Unconfirmed:', report['unconfirmedCount'])
    print('Output:', output)
    print('Inputs were opened read-only and were not modified.')


if __name__ == '__main__':
    main()
