import pytest
from nomad_browser.game.loot_scanner import LootScanner

def test_detect_loot_tag_in_micron():
    content = """`!Heading
Some text about the node.
#!loot:{"item":"mesh_compass","mode":"per_player","hint":"Look where the signal fades"}
More text here.
"""
    scanner = LootScanner()
    drops = scanner.scan(content)
    assert len(drops) == 1
    assert drops[0]["item"] == "mesh_compass"
    assert drops[0]["mode"] == "per_player"
    assert drops[0]["hint"] == "Look where the signal fades"

def test_detect_multiple_tags():
    content = """Some text
#!loot:{"item":"compass","mode":"once"}
Middle text
#!loot:{"item":"badge","mode":"per_player"}
End text"""
    scanner = LootScanner()
    drops = scanner.scan(content)
    assert len(drops) == 2
    assert drops[0]["item"] == "compass"
    assert drops[1]["item"] == "badge"

def test_no_loot_tags():
    content = "`!Just a normal page\nWith normal content."
    scanner = LootScanner()
    assert scanner.scan(content) == []

def test_malformed_tag_skipped():
    content = '#!loot:{bad json here}\n#!loot:{"item":"good","mode":"once"}'
    scanner = LootScanner()
    drops = scanner.scan(content)
    assert len(drops) == 1
    assert drops[0]["item"] == "good"

def test_loot_tag_in_html():
    content = """<html><body>
<p>Hello</p>
<!-- #!loot:{"item":"secret","mode":"once","hint":"hidden in html"} -->
</body></html>"""
    scanner = LootScanner()
    drops = scanner.scan(content)
    assert len(drops) == 1
    assert drops[0]["item"] == "secret"

def test_required_fields():
    content = '#!loot:{"item":"compass"}'
    scanner = LootScanner()
    drops = scanner.scan(content)
    assert len(drops) == 0

def test_valid_modes():
    content = '#!loot:{"item":"x","mode":"invalid"}'
    scanner = LootScanner()
    assert scanner.scan(content) == []
