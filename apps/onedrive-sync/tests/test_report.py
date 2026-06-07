"""Tests for RunReport accumulation and rendering."""

from report import RunReport, render_report


def test_report_counts_accumulate():
    r = RunReport()
    r.considered = 5
    r.skipped_pdf = 2
    r.skipped_duplicate = 1
    r.imported = 2
    assert r.considered == 5
    assert r.skipped_pdf + r.skipped_duplicate + r.imported == 5


def test_render_report_includes_all_buckets():
    r = RunReport(
        considered=10,
        imported=7,
        skipped_pdf=1,
        skipped_duplicate=1,
        skipped_quality=0,
        skipped_excluded_category=1,
        flagged_for_review=0,
        skipped_licensing=0,
        errors=0,
        records_changed=7,
    )
    output = render_report(r)
    assert "10" in output
    assert "imported" in output.lower()
    assert "duplicate" in output.lower()
    assert "excluded" in output.lower()


def test_render_report_zero_run():
    r = RunReport()
    output = render_report(r)
    assert "0" in output


def test_idempotency_records_changed_zero(tmp_path):
    """Composing the same fragment twice → records_changed = 0."""
    from compose import compose

    fragment = {
        "_meta": {},
        "books": [{"id": "onedrive:nhasachmienphi:book-a", "book_name": "A"}],
    }
    first = compose({}, fragment)
    second = compose(first, fragment)

    # Compute diff as the symmetric difference of book ids
    ids_before = {b["id"] for b in first["books"]}
    ids_after = {b["id"] for b in second["books"]}
    changed = len(ids_before.symmetric_difference(ids_after))
    assert changed == 0


def test_mixed_pipeline_counts(tmp_path):
    """Given a mixed candidate set, report counts match expectations."""
    import json as _json
    from categories import build_category_lookup, GateResult, apply_quality_gate, map_category
    from dedup import dedup_candidates
    from manifest import ManifestEntry

    # Build a tiny category-mapping.yaml
    import yaml
    mapping = {
        "mapped": {"Tiểu Thuyết": {"target": "Tiểu Thuyết", "count": 1}},
        "new_categories": {},
        "excluded": {"Kinh Tế - Quản Lý": {"count": 1, "reason": "utility-business"}},
        "on_unmapped": "error",
    }
    mapping_path = tmp_path / "cat-mapping.yaml"
    mapping_path.write_text(yaml.dump(mapping, allow_unicode=True))

    # Write a vnthuquan index with one duplicate
    vnt_dir = tmp_path / "vnthuquan"
    vnt_dir.mkdir()
    vnt_index = vnt_dir / "index.json"
    vnt_index.write_text(_json.dumps({
        "_meta": {},
        "books": [{"book_name": "Duplicate Book", "author": "Some Author"}],
    }))

    # Entries: epub, pdf-only (no epubFile), duplicate, excluded category, no cover
    epub_a = ManifestEntry(title="Good Book", category="Tiểu Thuyết", author="A",
                           epubFile="output/books/good.epub", imageFile="output/images/good.jpg")
    pdf_only = ManifestEntry(title="PDF Only", category="Tiểu Thuyết", author="B",
                             epubFile=None, imageFile="output/images/pdf.jpg")
    duplicate = ManifestEntry(title="Duplicate Book", category="Tiểu Thuyết", author="Some Author",
                              epubFile="output/books/dup.epub", imageFile="output/images/dup.jpg")
    excluded = ManifestEntry(title="Business Book", category="Kinh Tế - Quản Lý", author="C",
                             epubFile="output/books/biz.epub", imageFile="output/images/biz.jpg")
    no_cover = ManifestEntry(title="No Cover Book", category="Tiểu Thuyết", author="D",
                             epubFile="output/books/nc.epub", imageFile=None)

    # Create cover file for epub_a so it passes the quality gate
    staging = tmp_path / "staging"
    cover_dir = staging / "nhasachmienphi"
    cover_dir.mkdir(parents=True)
    (cover_dir / "good.jpg").touch()

    all_entries = [epub_a, pdf_only, duplicate, excluded, no_cover]
    epub_entries = [e for e in all_entries if e.epubFile]  # filter pdf-only
    skipped_pdf = len(all_entries) - len(epub_entries)

    dedup_result = dedup_candidates(
        epub_entries,
        vnthuquan_index_path=vnt_index,
        onedrive_index_path=None,
    )
    skipped_dup = len(dedup_result.skipped)

    cat_lookup = build_category_lookup(mapping_path)
    surfaced = []
    skipped_cat = 0
    skipped_quality = 0
    for book in dedup_result.kept:
        try:
            cat_result = map_category(book.entry, cat_lookup)
        except ValueError:
            skipped_cat += 1
            continue
        if cat_result.action == "exclude":
            skipped_cat += 1
            continue
        gate = apply_quality_gate(book.entry, tmp_path / "staging")
        if gate != GateResult.PASS:
            skipped_quality += 1
            continue
        surfaced.append(book)

    report = RunReport(
        considered=len(all_entries),
        skipped_pdf=skipped_pdf,
        skipped_duplicate=skipped_dup,
        skipped_excluded_category=skipped_cat,
        skipped_quality=skipped_quality,
        imported=len(surfaced),
    )

    # pdf_only=1, duplicate=1, excluded=1, no_cover=1 → only epub_a imported
    assert report.skipped_pdf == 1
    assert report.skipped_duplicate == 1
    assert report.skipped_excluded_category == 1
    assert report.skipped_quality == 1
    assert report.imported == 1
