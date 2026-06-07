from pathlib import Path

from extract import from_opf

FIXTURES = Path(__file__).parent / "fixtures"


def test_from_opf_extracts_title_and_author():
    epub_path = FIXTURES / "sample.epub"
    title, author = from_opf(epub_path)
    assert title == "Sample Book Title"
    assert author == "Sample Author"


def test_from_opf_missing_creator_returns_none(tmp_path):
    import io
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("mimetype", "application/epub+zip")
        z.writestr("META-INF/container.xml", """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>""")
        z.writestr("OEBPS/content.opf", """<?xml version="1.0"?>
<package version="2.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Only Title</dc:title>
    <dc:identifier id="uid">test-001</dc:identifier>
  </metadata>
  <manifest/><spine/>
</package>""")

    epub_path = tmp_path / "no_author.epub"
    epub_path.write_bytes(buf.getvalue())
    title, author = from_opf(epub_path)
    assert title == "Only Title"
    assert author is None
