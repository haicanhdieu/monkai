"""OPF metadata fallback extractor.

OFF THE CRITICAL PATH (AR11): the manifest supplies title/author/cover for all
2,343 epub. This module is defensive fallback only — called when a manifest entry
is missing a field. Uses stdlib zipfile + lxml (no Pillow, no network calls).
"""

import zipfile
from pathlib import Path

from lxml import etree

_DC_NS = "http://purl.org/dc/elements/1.1/"
_OPF_NS = "http://www.idpf.org/2007/opf"
_CONTAINER_NS = "urn:oasis:names:tc:opendocument:xmlns:container"


def from_opf(epub_path: Path) -> tuple[str | None, str | None]:
    """Extract (title, author) from EPUB OPF. Returns (None, None) on failure.

    Uses META-INF/container.xml → OPF path → dc:title, dc:creator.
    Author is None if dc:creator is absent.
    """
    try:
        with zipfile.ZipFile(epub_path, "r") as z:
            container_xml = z.read("META-INF/container.xml")
            root = etree.fromstring(container_xml)
            rootfile = root.find(f".//{{{_CONTAINER_NS}}}rootfile")
            if rootfile is None:
                return None, None
            opf_path = rootfile.get("full-path")
            if not opf_path:
                return None, None

            opf_xml = z.read(opf_path)
            pkg = etree.fromstring(opf_xml)

            title_el = pkg.find(f".//{{{_DC_NS}}}title")
            author_el = pkg.find(f".//{{{_DC_NS}}}creator")

            title = title_el.text if title_el is not None else None
            author = author_el.text if author_el is not None else None

        return title, author
    except (zipfile.BadZipFile, KeyError, AttributeError, TypeError, ValueError):
        return None, None
    except Exception:  # catches lxml.etree.XMLSyntaxError and others
        return None, None
