"""RunReport: transparent accounting of every sync run.

FR16 buckets: considered / imported / skipped_pdf / skipped_duplicate /
skipped_quality / errors — plus Phase-5-specific buckets from D5, D2, D7.
flagged_for_review is NOT a skip; those books are kept.
"""

from dataclasses import dataclass, field


@dataclass
class RunReport:
    considered: int = 0
    imported: int = 0
    skipped_pdf: int = 0
    skipped_duplicate: int = 0
    skipped_quality: int = 0
    skipped_excluded_category: int = 0
    flagged_for_review: int = 0
    skipped_licensing: int = 0
    errors: int = 0
    records_changed: int = 0
    files_copied: int = 0
    flagged_titles: list[str] = field(default_factory=list)


def render_report(r: RunReport) -> str:
    """Return a human-readable summary table."""
    lines = [
        "─" * 48,
        "  sync-books run report",
        "─" * 48,
        f"  Considered:            {r.considered:>6}",
        f"  Imported:              {r.imported:>6}",
        f"  Skipped — pdf-only:    {r.skipped_pdf:>6}",
        f"  Skipped — duplicate:   {r.skipped_duplicate:>6}",
        f"  Skipped — quality:     {r.skipped_quality:>6}",
        f"  Skipped — excluded:    {r.skipped_excluded_category:>6}",
        f"  Skipped — licensing:   {r.skipped_licensing:>6}",
        f"  Flagged for review:    {r.flagged_for_review:>6}",
        f"  Errors:                {r.errors:>6}",
        f"  Records changed:       {r.records_changed:>6}",
        f"  Files copied:          {r.files_copied:>6}",
        "─" * 48,
    ]
    if r.flagged_titles:
        lines.append("  Flagged titles (review):")
        for t in r.flagged_titles[:10]:
            lines.append(f"    - {t}")
        if len(r.flagged_titles) > 10:
            lines.append(f"    ... and {len(r.flagged_titles) - 10} more")
        lines.append("─" * 48)
    return "\n".join(lines)
