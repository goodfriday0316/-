"""Offline, read-only GameData/Chronicle/image ID comparison. Python standard library only."""
import argparse
import collections
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path, PurePosixPath
import sqlite3
import tempfile
import uuid
import zipfile

# Exact aliases only; source values are retained in the report, never rewritten.
# TheDragons/Hero8: BazaarPlusPlus TheDragonsHeroId.cs at
# https://github.com/BazaarPlusPlus/BazaarPlusPlus/blob/fe1fe705fc084cb8f99314e758fcf7f40cf57fa5/bazaarplusplus-mod/src/BazaarPlusPlus.Core/GameState/TheDragonsHeroId.cs
DRAGON_HEROES = frozenset(('Dragons', 'The Dragons', 'TheDragons', 'Hero8'))
COMPARISON_FIELDS = ('name', 'heroes', 'size', 'tags', 'artKey')
MAX_DB = 1024 * 1024 * 1024
MAX_IMAGE = 5 * 1024 * 1024


def digest(path):
    result = hashlib.sha256()
    with Path(path).open('rb') as source:
        for data in iter(lambda: source.read(1024 * 1024), b''):
            result.update(data)
    return result.hexdigest()


@contextmanager
def read_db(path):
    path = Path(path).resolve(strict=True)
    # Immutable mode prevents even SQLite sidecar writes; refuse uncheckpointed WAL.
    wal = Path(str(path) + '-wal')
    if wal.exists() and wal.stat().st_size:
        raise ValueError('Close the producer and use a checkpointed database copy: ' + path.name)
    db = sqlite3.connect(path.as_uri() + '?mode=ro&immutable=1', uri=True)
    try:
        db.execute('PRAGMA query_only=ON')
        if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise ValueError('SQLite integrity check failed: ' + path.name)
        yield db
    finally:
        db.close()


@contextmanager
def game_db(path):
    path = Path(path).resolve(strict=True)
    if path.suffix.lower() != '.zip':
        yield path
        return
    with zipfile.ZipFile(path) as archive:
        choices = [e for e in archive.infolist() if not e.is_dir() and PurePosixPath(e.filename).name == 'GameData.db']
        if len(choices) != 1 or choices[0].filename != 'GameData.db':
            raise ValueError('ZIP must contain exactly one root GameData.db, without unsafe paths.')
        entry = choices[0]
        if entry.flag_bits & 1 or not 0 < entry.file_size <= MAX_DB:
            raise ValueError('Encrypted, empty, or oversized GameData.db is unsupported.')
        with tempfile.TemporaryDirectory(prefix='bazaar-readonly-') as folder:
            target = Path(folder) / 'GameData.db'
            with archive.open(entry) as source, target.open('xb') as destination:
                total = 0
                for data in iter(lambda: source.read(1024 * 1024), b''):
                    total += len(data)
                    if total > MAX_DB:
                        raise ValueError('Expanded database exceeds 1GiB.')
                    destination.write(data)
            yield target  # Reaching ZIP entry EOF verified its CRC.


def canonical(value):
    if not isinstance(value, str) or str(uuid.UUID(value)) != value:
        raise ValueError('noncanonical-uuid')
    return value


def strings(value, name):
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise ValueError('invalid-' + name)
    return value


def normalized_card(card):
    ident = canonical(card.get('Id'))
    title = (card.get('Localization') or {}).get('Title') or {}
    name = title.get('Text')
    name = name.strip() if isinstance(name, str) and name.strip() else card.get('InternalName') or ident
    name = str(name)
    size = card.get('Size')
    if not isinstance(size, str) or size.lower() not in ('small', 'medium', 'large'):
        raise ValueError('unknown-size')
    return {'id': ident, 'name': name, 'heroes': [h.strip() for h in strings(card.get('Heroes'), 'heroes')],
            'size': size.lower(), 'tags': strings(card.get('Tags'), 'tags'),
            'artKey': card.get('ArtKey') if isinstance(card.get('ArtKey'), str) else None}


def exclusion(name):
    # Same explicit name rules as Chronicle's import_templates.should_import_item.
    if not name.strip(): return 'empty-name'
    if '[' in name: return 'name-bracket-marker'
    if 'TEMPLATE' in name.upper(): return 'name-template-marker'
    if 'DEBUG' in name.upper(): return 'name-debug-marker'
    return None


def image_index(paths):
    found = collections.Counter()
    valid = set()
    issues = []
    files = 0

    def inspect(name, size, opener):
        nonlocal files
        if not name.lower().endswith('.webp'): return
        files += 1
        p = PurePosixPath(name)
        try:
            if p.is_absolute() or '..' in p.parts or '\\' in name or not 0 < size <= MAX_IMAGE:
                raise ValueError('unsafe-path-or-image-size')
            ident = canonical(p.stem)
            found[ident] += 1
            with opener() as source:
                header = source.read(12)
                if header[:4] != b'RIFF' or header[8:12] != b'WEBP':
                    raise ValueError('invalid-webp-header')
                total = len(header)
                for data in iter(lambda: source.read(1024 * 1024), b''):
                    total += len(data)
                    if total > MAX_IMAGE: raise ValueError('expanded-image-too-large')
            valid.add(ident)
        except (ValueError, OSError, zipfile.BadZipFile, RuntimeError) as error:
            issues.append({'file': name, 'reason': str(error)})

    for raw_path in paths:
        path = Path(raw_path).resolve(strict=True)
        if path.is_dir():
            for image in sorted(path.rglob('*')):
                if image.is_file():
                    if image.is_symlink():
                        issues.append({'file': str(image.relative_to(path)), 'reason': 'symlink-not-followed'})
                        continue
                    inspect(image.relative_to(path).as_posix(), image.stat().st_size, lambda p=image: p.open('rb'))
        else:
            with zipfile.ZipFile(path) as archive:
                for entry in archive.infolist():
                    if not entry.is_dir():
                        inspect(entry.filename, entry.file_size, lambda e=entry: archive.open(e))
    duplicates = sorted(i for i, count in found.items() if count > 1)
    return {i for i, count in found.items() if count == 1 and i in valid}, {
        'files': files, 'validUniqueIds': sum(count == 1 and i in valid for i, count in found.items()),
        'duplicateIds': duplicates, 'issues': issues,
        'validation': 'ZIP CRC and WebP signature only; pixel decoding is not performed'}


def compare(game_path, chronicle_path, image_paths=()):
    if isinstance(image_paths, (str, Path)): image_paths = [image_paths]
    image_paths = list(image_paths)
    before = {str(Path(p).resolve()): digest(p) for p in (game_path, chronicle_path)}
    details = {'newItems': [], 'changes': [], 'dragonsItems': [], 'excludedItems': [], 'invalidRecords': []}
    grouped = collections.defaultdict(list)
    type_counts = collections.Counter()
    versions = collections.Counter()
    raw_count = 0
    with game_db(game_path) as path, read_db(path) as db:
        for row_id, data in db.execute('SELECT Id,Data FROM cards'):
            try:
                card = json.loads(data)
                if not isinstance(card, dict): raise ValueError('card-not-object')
                type_counts[str(card.get('Type'))] += 1
                if card.get('Type') != 'Item': continue
                raw_count += 1
                versions[str(card.get('Version'))] += 1
                ident = canonical(card.get('Id'))
                grouped[ident].append((row_id, card))
            except (ValueError, TypeError, UnicodeError) as error:
                details['invalidRecords'].append({'rowId': str(row_id), 'reason': str(error)})
    raw = {}
    for ident, candidates in grouped.items():
        if len(candidates) != 1:
            details['invalidRecords'].append({'id': ident, 'reason': 'duplicate-json-id'})
            continue
        row_id, card = candidates[0]
        try:
            if row_id != ident: raise ValueError('row-json-id-conflict')
            raw[ident] = normalized_card(card)
        except (ValueError, TypeError, AttributeError) as error:
            details['invalidRecords'].append({'id': ident, 'reason': str(error)})
    eligible = {}
    for ident, item in raw.items():
        reason = exclusion(item['name'])
        if reason: details['excludedItems'].append({**item, 'reason': reason})
        else: eligible[ident] = item
    old = {}
    with read_db(chronicle_path) as db:
        for ident, name, heroes, size, tags, art in db.execute('SELECT template_id,name,heroes_json,size,tags_json,art_key FROM templates'):
            canonical(ident)
            if ident in old: raise ValueError('Duplicate Chronicle ID: ' + ident)
            old[ident] = {'id': ident, 'name': name, 'heroes': strings(json.loads(heroes), 'chronicle-heroes'),
                          'size': size, 'tags': strings(json.loads(tags), 'chronicle-tags'), 'artKey': art}
    changed_by_field = dict.fromkeys(COMPARISON_FIELDS, 0)
    membership_changes = {'heroes': 0, 'tags': 0}
    for ident in sorted(set(eligible) & set(old)):
        changes = {key: {'chronicle': old[ident][key], 'game': eligible[ident][key]}
                   for key in COMPARISON_FIELDS if old[ident][key] != eligible[ident][key]}
        if changes:
            details['changes'].append({'id': ident, 'fields': changes})
            for key in changes:
                changed_by_field[key] += 1
        for key in membership_changes:
            if set(old[ident][key]) != set(eligible[ident][key]):
                membership_changes[key] += 1
    images, image_report = image_index(image_paths)
    for ident in sorted(set(eligible) - set(old)):
        details['newItems'].append({**eligible[ident], 'imageMatched': ident in images if image_paths else None})
    dragons = {i for i, item in raw.items() if DRAGON_HEROES.intersection(item['heroes'])}
    for ident in sorted(dragons):
        details['dragonsItems'].append({**raw[ident], 'chroniclePresent': ident in old,
            'chronicleHeroes': old[ident]['heroes'] if ident in old else None,
            'eligible': ident in eligible, 'imageMatched': ident in images if image_paths else None})
    for path, sha in before.items():
        if digest(path) != sha: raise ValueError('Input changed while reading: ' + Path(path).name)
    source_metadata = {'itemVersions': dict(versions), 'zipEntryTime': None,
                       'note': 'ZIP timestamp and card Version are not a verified game patch manifest.'}
    if Path(game_path).suffix.lower() == '.zip':
        with zipfile.ZipFile(game_path) as archive:
            source_metadata['zipEntryTime'] = list(archive.getinfo('GameData.db').date_time)
    return {'format': 'bazaar-dragons-comparison-v1', 'sourceMetadata': source_metadata,
        'inputs': [{'file': Path(path).name, 'sha256': sha} for path, sha in before.items()],
        'summary': {'rawItemCount': raw_count, 'chronicleEligibleCount': len(eligible), 'chronicleCount': len(old),
            'existingIds': len(set(eligible) & set(old)), 'newEligibleIds': len(set(eligible) - set(old)),
            'rawIdsAbsentFromChronicle': len(set(raw) - set(old)), 'chronicleOnlyIds': len(set(old) - set(raw)),
            'metadataChangedIds': len(details['changes']), 'metadataChangedByField': changed_by_field,
            'heroMembershipChangedIds': membership_changes['heroes'],
            'tagMembershipChangedIds': membership_changes['tags'],
            'rawDragonsItems': len(dragons),
            'eligibleDragonsItems': len(dragons & set(eligible)), 'newDragonsItems': len((dragons & set(eligible)) - set(old)),
            'dragonImagesMatched': len(dragons & images) if image_paths else None,
            'imageFiles': image_report['files'] if image_paths else None,
            'imageIdsNotInGame': len(images - set(raw)) if image_paths else None,
            'imageIdsNotInChronicle': len(images - set(old)) if image_paths else None,
            'newEligibleWithImages': len((set(eligible) - set(old)) & images) if image_paths else None,
            'excludedWithImages': len((set(raw) - set(eligible)) & images) if image_paths else None},
        'targetHeroValues': sorted(DRAGON_HEROES),
        'heroValues': dict(sorted(collections.Counter(h for item in raw.values() for h in item['heroes']).items())),
        'cardTypes': dict(type_counts), 'images': image_report if image_paths else None, 'details': details,
        'notes': ['This report never changes catalog, image files, or decks.',
                  'Dragon tags, art keys, and similar names are not evidence of Dragons ownership.',
                  'No Dragons in this file does not establish what the current running game contains.',
                  'No migration or catalog update is generated; review the exact IDs first.']}


def summary_text(report):
    s = report['summary']
    return '\n'.join(['LOCAL READ-ONLY COMPARISON',
        f"Game Item records: {s['rawItemCount']}", f"Chronicle-eligible: {s['chronicleEligibleCount']}",
        f"Existing exact IDs: {s['existingIds']}; new eligible IDs: {s['newEligibleIds']}",
        f"Changed metadata IDs: {s['metadataChangedIds']}",
        'Changed fields (exact values, including array order): ' + ', '.join(f'{key}={count}' for key, count in s['metadataChangedByField'].items()),
        f"Membership changes (ignoring order and duplicates): heroes={s['heroMembershipChangedIds']}, tags={s['tagMembershipChangedIds']}",
        f"Dragons raw/eligible/new: {s['rawDragonsItems']}/{s['eligibleDragonsItems']}/{s['newDragonsItems']}",
        f"Dragons images matched: {s['dragonImagesMatched']}",
        'Detailed IDs and classifications are in the JSON report.', 'No original files or deck data were modified.']) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', required=True)
    parser.add_argument('--chronicle', required=True)
    parser.add_argument('--images', nargs='*', default=[])
    parser.add_argument('--output', default='local-data/dragons-comparison.json')
    args = parser.parse_args()
    output = Path(args.output).resolve()
    summary = output.with_suffix('.summary.txt')
    if output.suffix.lower() != '.json' or output.exists() or summary.exists():
        parser.error('Choose a new .json output; existing files are never overwritten.')
    if any(part in ('src', 'public', 'dist') for part in output.parts):
        parser.error('Private game reports must not be written into src/public/dist.')
    try:
        result = compare(args.game, args.chronicle, args.images)
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open('x', encoding='utf-8') as destination:
            json.dump(result, destination, ensure_ascii=False, indent=2)
        with summary.open('x', encoding='utf-8') as destination:
            destination.write(summary_text(result))
    except (OSError, ValueError, TypeError, sqlite3.Error, zipfile.BadZipFile) as error:
        parser.exit(1, str(error) + '\n')
    print(summary_text(result), end='')
    print('Saved locally:', output)


if __name__ == '__main__':
    main()
