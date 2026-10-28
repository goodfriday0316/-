"""Synthetic fixtures only. This file contains no game data or real item IDs."""
import hashlib
import importlib.util
import json
import pathlib
import sqlite3
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
TOOL = ROOT / 'tools' / 'compare_dragons.py'
spec = importlib.util.spec_from_file_location('compare_dragons', TOOL)
module = importlib.util.module_from_spec(spec)
# The tool is created by the implementation task before these tests are run.
spec.loader.exec_module(module)

A = '11111111-1111-4111-8111-111111111111'
B = '22222222-2222-4222-8222-222222222222'
C = '33333333-3333-4333-8333-333333333333'
D = '44444444-4444-4444-8444-444444444444'
WEBP_HEADER_FIXTURE = b'RIFF\x10\x00\x00\x00WEBPsynthetic-header-only'


def card(ident, name='Synthetic', heroes=None, tags=None, art=None):
    return {
        'Id': ident, 'Type': 'Item', 'Version': '5.0.0',
        'InternalName': name, 'Heroes': heroes or ['Common'],
        'Size': 'Small', 'Tags': tags or [], 'ArtKey': art or ('art-' + ident),
        'Localization': {'Title': {'Text': name, 'Key': 'synthetic-title-' + ident}},
    }


def game(path, cards):
    with sqlite3.connect(path) as db:
        # No PK here so tests can represent corrupt/ambiguous input explicitly.
        db.execute('CREATE TABLE cards(Id TEXT, Data BLOB)')
        db.executemany('INSERT INTO cards VALUES(?, ?)', [
            (row_id, json.dumps(value) if not isinstance(value, str) else value)
            for row_id, value in cards
        ])


def chronicle(path, cards):
    with sqlite3.connect(path) as db:
        db.execute('CREATE TABLE templates(template_id TEXT, name TEXT, heroes_json TEXT, size TEXT, tags_json TEXT, art_key TEXT, image_path TEXT, ignored INTEGER DEFAULT 0)')
        db.executemany('INSERT INTO templates VALUES(?,?,?,?,?,?,?,?)', [
            (c['Id'], c['Localization']['Title']['Text'], json.dumps(c['Heroes']),
             c['Size'].lower(), json.dumps(c['Tags']), c['ArtKey'], None, 0)
            for c in cards
        ])


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def image_zip(path, names):
    with zipfile.ZipFile(path, 'w') as archive:
        for name in names:
            archive.writestr(name, WEBP_HEADER_FIXTURE)


class CompareTests(unittest.TestCase):
    def test_eligible_ids_and_metadata_are_preserved_readonly(self):
        with tempfile.TemporaryDirectory() as temp:
            p = pathlib.Path(temp)
            a, b, excluded = card(A, 'Synthetic A'), card(B, 'Synthetic B', ['Vanessa']), card(D, '[DEBUG] Synthetic')
            game(p/'GameData.db', [(c['Id'], c) for c in [a, b, excluded]])
            chronicle(p/'templates.sqlite3', [a, b])
            before = [digest(p/n) for n in ['GameData.db', 'templates.sqlite3']]
            report = module.compare(p/'GameData.db', p/'templates.sqlite3')
            s = report['summary']
            for key, count in {'rawItemCount': 3, 'chronicleEligibleCount': 2, 'chronicleCount': 2, 'existingIds': 2, 'newEligibleIds': 0, 'chronicleOnlyIds': 0, 'metadataChangedIds': 0, 'rawDragonsItems': 0}.items():
                self.assertEqual(s[key], count, key)
            self.assertEqual(before, [digest(p/n) for n in ['GameData.db', 'templates.sqlite3']])
            self.assertEqual(report['details']['newItems'], [])
            self.assertEqual(len(report['details']['excludedItems']), 1)
            self.assertEqual(s['metadataChangedByField'], {'name': 0, 'heroes': 0, 'size': 0, 'tags': 0, 'artKey': 0})
            self.assertEqual(s['heroMembershipChangedIds'], 0)
            self.assertEqual(s['tagMembershipChangedIds'], 0)

    def test_new_dragons_and_existing_wrong_heroes_use_ids_not_tag_or_art_key(self):
        with tempfile.TemporaryDirectory() as temp:
            p = pathlib.Path(temp)
            raw_a = card(A, 'Existing Synthetic', ['Dragons'])
            old_a = card(A, 'Existing Synthetic', ['Common'])
            new_b = card(B, 'New Synthetic', ['The Dragons'])
            tag_only = card(C, 'Tagged Synthetic', ['Common'], ['Dragon'], D)
            game(p/'GameData.db', [(c['Id'], c) for c in [raw_a, new_b, tag_only]])
            chronicle(p/'templates.sqlite3', [old_a, tag_only])
            image_zip(p/'items.zip', ['items/'+A+'.webp', 'items/'+B+'.webp', D+'.webp'])
            originals = {name: digest(p/name) for name in ['GameData.db', 'templates.sqlite3', 'items.zip']}
            report = module.compare(p/'GameData.db', p/'templates.sqlite3', [p/'items.zip'])
            s = report['summary']
            for key, count in {'rawItemCount': 3, 'newEligibleIds': 1, 'metadataChangedIds': 1, 'rawDragonsItems': 2, 'eligibleDragonsItems': 2, 'newDragonsItems': 1, 'dragonImagesMatched': 2, 'imageFiles': 3, 'imageIdsNotInGame': 1}.items():
                self.assertEqual(s[key], count, key)
            self.assertEqual(len(report['details']['dragonsItems']), 2)
            self.assertEqual(originals, {name: digest(p/name) for name in originals})

    def test_canonical_and_legacy_dragons_aliases_preserve_original_hero_values(self):
        with tempfile.TemporaryDirectory() as temp:
            p = pathlib.Path(temp)
            canonical = card(A, 'Canonical Synthetic', ['TheDragons'])
            legacy = card(B, 'Legacy Synthetic', ['Hero8'])
            tag_only = card(C, 'Dragon Synthetic', ['Common'], ['Dragon'])
            other_hero = card(D, 'Similar Hero Synthetic', ['Hero80'])
            cards = [canonical, legacy, tag_only, other_hero]
            game(p/'GameData.db', [(c['Id'], c) for c in cards])
            chronicle(p/'templates.sqlite3', cards)
            report = module.compare(p/'GameData.db', p/'templates.sqlite3')
            self.assertEqual(report['summary']['rawDragonsItems'], 2)
            self.assertEqual(report['summary']['eligibleDragonsItems'], 2)
            self.assertEqual(report['summary']['newDragonsItems'], 0)
            self.assertEqual({i['id']: i['heroes'] for i in report['details']['dragonsItems']},
                             {A: ['TheDragons'], B: ['Hero8']})
            self.assertEqual(report['heroValues'], {'Common': 1, 'Hero8': 1, 'Hero80': 1, 'TheDragons': 1})
            self.assertEqual(set(report['targetHeroValues']), {'Dragons', 'The Dragons', 'TheDragons', 'Hero8'})

    def test_whole_catalog_field_counts_and_new_ids_are_independent_of_similar_names(self):
        with tempfile.TemporaryDirectory() as temp:
            p = pathlib.Path(temp)
            old_a = card(A, 'Synthetic A', ['Common'], ['Tool'])
            old_b = card(B, 'Synthetic B', ['Dooley'], ['Weapon'])
            stable = card(C, 'Same Synthetic Name', ['Common'], ['Dragon'])
            new_a = card(A, 'Synthetic A Revised', ['TheDragons'], ['Tool', 'Weapon'], 'revised-art')
            new_a['Size'] = 'Medium'
            new_b = card(B, 'Synthetic B', ['Vanessa'], ['Weapon', 'Tech'])
            distinct_id = card(D, 'Same Synthetic Name', ['Common'], ['Dragon'])
            game(p/'GameData.db', [(c['Id'], c) for c in [new_a, new_b, stable, distinct_id]])
            chronicle(p/'templates.sqlite3', [old_a, old_b, stable])
            report = module.compare(p/'GameData.db', p/'templates.sqlite3')
            self.assertEqual(report['summary']['existingIds'], 3)
            self.assertEqual(report['summary']['newEligibleIds'], 1)
            self.assertEqual(report['summary']['metadataChangedIds'], 2)
            self.assertEqual(report['summary']['metadataChangedByField'],
                             {'name': 1, 'heroes': 2, 'size': 1, 'tags': 2, 'artKey': 1})
            self.assertEqual(report['summary']['heroMembershipChangedIds'], 2)
            self.assertEqual(report['summary']['tagMembershipChangedIds'], 2)
            self.assertEqual([i['id'] for i in report['details']['newItems']], [D])
            changes = {i['id']: i['fields'] for i in report['details']['changes']}
            self.assertEqual(changes[A]['heroes'], {'chronicle': ['Common'], 'game': ['TheDragons']})
            self.assertEqual(changes[B]['tags'], {'chronicle': ['Weapon'], 'game': ['Weapon', 'Tech']})
            self.assertNotIn(C, changes)
            self.assertIn('heroes=2', module.summary_text(report))

    def test_membership_counts_distinguish_array_order_from_changed_hero_and_tag_values(self):
        for heroes, tags, expected_membership in [
            (['Common', 'Vanessa'], ['Tool', 'Weapon'], 0),
            (['Vanessa', 'Dragons'], ['Weapon', 'Tech'], 1),
        ]:
            with self.subTest(heroes=heroes, tags=tags), tempfile.TemporaryDirectory() as temp:
                p = pathlib.Path(temp)
                previous = card(A, 'Synthetic', ['Vanessa', 'Common'], ['Weapon', 'Tool'])
                current = card(A, 'Synthetic', heroes, tags)
                game(p/'GameData.db', [(A, current)])
                chronicle(p/'templates.sqlite3', [previous])
                report = module.compare(p/'GameData.db', p/'templates.sqlite3')
                summary = report['summary']
                self.assertEqual(summary['metadataChangedIds'], 1)
                self.assertEqual(summary['metadataChangedByField'],
                                 {'name': 0, 'heroes': 1, 'size': 0, 'tags': 1, 'artKey': 0})
                self.assertEqual(summary['heroMembershipChangedIds'], expected_membership)
                self.assertEqual(summary['tagMembershipChangedIds'], expected_membership)
                fields = report['details']['changes'][0]['fields']
                self.assertEqual(fields['heroes'], {'chronicle': previous['Heroes'], 'game': heroes})
                self.assertEqual(fields['tags'], {'chronicle': previous['Tags'], 'game': tags})
                self.assertIn('including array order', module.summary_text(report))
                self.assertIn(f'heroes={expected_membership}, tags={expected_membership}', module.summary_text(report))

    def test_json_row_id_conflicts_and_invalid_records_are_not_repaired_by_guessing(self):
        with tempfile.TemporaryDirectory() as temp:
            p = pathlib.Path(temp)
            a = card(A, 'Valid Synthetic')
            game(p/'GameData.db', [(A, a), (B, card(C, 'Conflicting Synthetic', ['Dragons'])), (D, '{broken')])
            chronicle(p/'templates.sqlite3', [a])
            report = module.compare(p/'GameData.db', p/'templates.sqlite3')
            self.assertEqual(report['summary']['chronicleEligibleCount'], 1)
            self.assertEqual(report['summary']['newDragonsItems'], 0)
            self.assertEqual(report['details']['newItems'], [])

    def test_zip_and_plain_database_have_equal_comparison_counts(self):
        with tempfile.TemporaryDirectory() as temp:
            p = pathlib.Path(temp)
            a = card(A, 'Synthetic', ['Dragons'])
            game(p/'GameData.db', [(A, a)])
            chronicle(p/'templates.sqlite3', [a])
            with zipfile.ZipFile(p/'GameData.db.zip', 'w') as z:
                z.write(p/'GameData.db', 'GameData.db')
            plain = module.compare(p/'GameData.db', p/'templates.sqlite3')
            zipped = module.compare(p/'GameData.db.zip', p/'templates.sqlite3')
            self.assertEqual(plain['summary'], zipped['summary'])
            for filename in ['../GameData.db', 'nested/GameData.db']:
                with zipfile.ZipFile(p/'bad.zip', 'w') as z:
                    z.write(p/'GameData.db', filename)
                with self.assertRaises((ValueError, zipfile.BadZipFile)):
                    module.compare(p/'bad.zip', p/'templates.sqlite3')
            with zipfile.ZipFile(p/'ambiguous.zip', 'w') as z:
                z.write(p/'GameData.db', 'GameData.db')
                z.write(p/'GameData.db', 'nested/GameData.db')
            with self.assertRaises((ValueError, zipfile.BadZipFile)):
                module.compare(p/'ambiguous.zip', p/'templates.sqlite3')

    def test_duplicate_game_ids_are_quarantined(self):
        with tempfile.TemporaryDirectory() as temp:
            p = pathlib.Path(temp)
            a = card(A, 'Synthetic duplicate', ['Dragons'])
            game(p/'GameData.db', [(A, a), (A, a)])
            chronicle(p/'templates.sqlite3', [])
            report = module.compare(p/'GameData.db', p/'templates.sqlite3')
            self.assertEqual(report['summary']['newEligibleIds'], 0)
            self.assertEqual(report['summary']['eligibleDragonsItems'], 0)

    def test_cli_refuses_to_overwrite_an_existing_report(self):
        with tempfile.TemporaryDirectory() as temp:
            p = pathlib.Path(temp)
            a = card(A)
            game(p/'GameData.db', [(A, a)])
            chronicle(p/'templates.sqlite3', [a])
            output = p/'report.json'
            output.write_text('KEEP USER FILE', encoding='utf-8')
            result = subprocess.run([sys.executable, str(TOOL), '--game', str(p/'GameData.db'), '--chronicle', str(p/'templates.sqlite3'), '--output', str(output)], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(output.read_text(encoding='utf-8'), 'KEEP USER FILE')


if __name__ == '__main__':
    unittest.main()
