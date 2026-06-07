import subprocess
from pathlib import Path

import typer

import rclone

app = typer.Typer(help="OneDrive epub import pipeline")


@app.command()
def pull():
    """Pull eligible epub files from OneDrive via rclone."""
    staging = Path("staging/onedrive")
    staging.mkdir(parents=True, exist_ok=True)
    args = rclone.build_pull_args()
    result = subprocess.run(["rclone", *args])
    if result.returncode != 0:
        raise typer.Exit(code=result.returncode)


@app.command()
def index(
    licensing_confirmed: bool = typer.Option(False, "--licensing-confirmed", help="Confirm books are redistributable (required to surface)"),
    category_mapping: Path = typer.Option(
        Path("../../_bmad-output/planning-artifacts/phase-5-onedrive-import/category-mapping.yaml"),
        "--category-mapping",
        help="Path to category-mapping.yaml",
    ),
    publish_dir: Path = typer.Option(
        Path("publish"),
        "--publish-dir",
        help="Local directory to assemble the publish payload",
    ),
):
    """Parse manifest, filter to epub-only, resolve staging paths."""
    from manifest import eligible_epub, epub_staging_path, load_manifest

    manifest_path = Path("staging/onedrive/nhasachmienphi/__books.json")
    staging_dir = Path("staging/onedrive")

    entries = load_manifest(manifest_path)
    epub_entries = eligible_epub(entries)

    missing: list[Path] = []
    candidates = []
    for entry in epub_entries:
        path = epub_staging_path(entry, staging_dir)
        if not path.exists():
            missing.append(path)
        else:
            candidates.append((entry, path))

    if missing:
        typer.echo(f"[warn] {len(missing)} epub files missing from staging")

    from dedup import dedup_candidates

    vnthuquan_idx = Path("../../apps/crawler/data/book-data/vnthuquan/index.json")
    onedrive_idx = staging_dir / "index.json"
    report = dedup_candidates(
        [entry for entry, _ in candidates],
        vnthuquan_index_path=vnthuquan_idx if vnthuquan_idx.exists() else None,
        onedrive_index_path=onedrive_idx if onedrive_idx.exists() else None,
    )

    if report.skipped:
        typer.echo(f"[dedup] {len(report.skipped)} duplicates skipped")
    if report.flagged:
        typer.echo(f"[dedup] {len(report.flagged)} title-only matches flagged for review")

    from categories import GateResult, apply_quality_gate, build_category_lookup, map_category

    cat_lookup = build_category_lookup(category_mapping)
    surfaced = []
    skipped_cat = 0
    skipped_quality = 0
    skipped_licensing = 0

    for book in report.kept:
        # Category mapping
        try:
            cat_result = map_category(book.entry, cat_lookup)
        except ValueError as e:
            typer.echo(f"[error] {e}", err=True)
            raise typer.Exit(code=1)

        if cat_result.action == "exclude":
            skipped_cat += 1
            continue

        # Quality gate
        gate = apply_quality_gate(book.entry, staging_dir)
        if gate == GateResult.FAIL_TITLE:
            skipped_quality += 1
            continue
        if gate == GateResult.FAIL_COVER:
            skipped_quality += 1
            continue

        # Licensing gate (FR24, D7)
        if not licensing_confirmed:
            skipped_licensing += 1
            continue

        surfaced.append((book, cat_result))

    if skipped_cat:
        typer.echo(f"[categories] {skipped_cat} excluded by category mapping")
    if skipped_quality:
        typer.echo(f"[quality] {skipped_quality} skipped by quality gate")
    if skipped_licensing:
        typer.echo(f"[licensing] {skipped_licensing} held pending --licensing-confirmed flag")

    # Copy epub + cover files and build index records
    import json
    import os
    import shutil
    from collections import Counter

    from compose import build_record, compose, id_to_filename, write_atomic

    # Detect epub basename collisions before copying
    epub_basenames = Counter(
        epub_staging_path(book.entry, staging_dir).name for book, _ in surfaced
    )

    records = []
    files_copied = 0
    errors_count = 0
    warned_basenames: set[str] = set()
    for book, cat_result in surfaced:
        entry = book.entry
        epub_src = epub_staging_path(entry, staging_dir)
        epub_basename = epub_src.name

        if epub_basenames[epub_basename] > 1 and epub_basename not in warned_basenames:
            typer.echo(
                f"[warn] epubFile basename collision: '{epub_basename}' shared by "
                f"{epub_basenames[epub_basename]} books — later entry overwrites earlier",
                err=True,
            )
            warned_basenames.add(epub_basename)

        # Copy epub
        epub_dest = publish_dir / "onedrive" / "nhasachmienphi" / epub_basename
        epub_dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copy2(epub_src, epub_dest)
            files_copied += 1
        except OSError as e:
            typer.echo(f"[error] Failed to copy epub '{epub_basename}': {e}", err=True)
            errors_count += 1
            continue

        # Copy cover
        if entry.imageFile:
            cover_src = staging_dir / "nhasachmienphi" / os.path.basename(entry.imageFile)
            if cover_src.exists():
                safe_id = id_to_filename(book.id)
                cover_dest = publish_dir / "onedrive" / "cover" / f"{safe_id}.jpg"
                cover_dest.parent.mkdir(parents=True, exist_ok=True)
                try:
                    shutil.copy2(cover_src, cover_dest)
                    files_copied += 1
                except OSError as e:
                    typer.echo(f"[warn] Failed to copy cover for '{entry.title}': {e}", err=True)

        records.append(build_record(book, cat_result))

    # Compose and emit onedrive/index.json
    index_path = publish_dir / "onedrive" / "index.json"
    existing = {}
    if index_path.exists():
        existing = json.loads(index_path.read_text(encoding="utf-8"))

    fragment = {"_meta": {"source": "nhasachmienphi", "count": len(records)}, "books": records}
    merged = compose(existing, fragment)
    write_atomic(index_path, merged)

    from report import RunReport

    # Compute records_changed vs prior index
    prior_ids = {b.get("id") for b in existing.get("books", []) if b.get("id", "").startswith("onedrive:")}
    new_ids = {b.get("id") for b in records}
    records_changed = len(prior_ids.symmetric_difference(new_ids))

    run_report = RunReport(
        considered=len(entries),
        imported=len(records),
        skipped_pdf=len(entries) - len(epub_entries),
        skipped_duplicate=len(report.skipped),
        skipped_quality=skipped_quality,
        skipped_excluded_category=skipped_cat,
        flagged_for_review=len(report.flagged),
        flagged_titles=[f.title for f in report.flagged],
        skipped_licensing=skipped_licensing,
        records_changed=records_changed,
        files_copied=files_copied,
        errors=errors_count,
    )

    typer.echo(f"[index] {len(records)} books pass all gates")
    typer.echo(f"[emit] onedrive/index.json written → {index_path}")
    return merged, run_report


@app.command()
def publish(
    publish_dir: Path = typer.Option(Path("publish"), "--publish-dir"),
    pi_config_path: Path = typer.Option(
        Path("../../.pi-server.yaml"),
        "--pi-config",
        help="Path to .pi-server.yaml",
    ),
):
    """Push the publish payload to the Pi atomically."""
    from publish import PiConfig, publish_to_pi

    cfg = PiConfig.from_yaml(pi_config_path)
    publish_to_pi(publish_dir, cfg)
    typer.echo("[publish] done — payload on Pi")


@app.command()
def all(
    licensing_confirmed: bool = typer.Option(False, "--licensing-confirmed"),
    pi_config_path: Path = typer.Option(Path("../../.pi-server.yaml"), "--pi-config"),
    publish_dir: Path = typer.Option(Path("publish"), "--publish-dir"),
):
    """Run full pipeline: pull → index → compose → publish → report."""
    from report import render_report

    try:
        pull()
    except typer.Exit as e:
        typer.echo("[error] pull stage failed — aborting pipeline", err=True)
        raise typer.Exit(code=e.code)

    run_report = None
    try:
        result = index(
            licensing_confirmed=licensing_confirmed,
            category_mapping=Path("../../_bmad-output/planning-artifacts/phase-5-onedrive-import/category-mapping.yaml"),
            publish_dir=publish_dir,
        )
        _, run_report = result if isinstance(result, tuple) else (result, None)
    except typer.Exit as e:
        typer.echo("[error] index stage failed — aborting pipeline", err=True)
        raise typer.Exit(code=e.code)

    from publish import PiConfig, publish_to_pi
    cfg = PiConfig.from_yaml(pi_config_path)
    publish_to_pi(publish_dir, cfg)

    if run_report:
        typer.echo(render_report(run_report))
    typer.echo("[all] pipeline complete")


if __name__ == "__main__":
    app()
