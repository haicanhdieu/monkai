# utils/logging.py
import logging
import os
from logging.handlers import RotatingFileHandler


def setup_logger(module_name: str, log_file: str = "logs/crawl.log") -> logging.Logger:
    """Create and configure a logger for a pipeline module.

    Outputs to both console (StreamHandler) and rotating log file.
    Format: "2026-02-27T10:30:00 [INFO] [crawler] message"

    Args:
        module_name: Name tag in log output, e.g. "crawler", "parser"
        log_file: Path to rotating log file (default: logs/crawl.log)
    """
    logger = logging.getLogger(module_name)

    # Avoid adding duplicate handlers if called multiple times
    if logger.handlers:
        return logger

    logger.setLevel(logging.DEBUG)
    logger.propagate = False

    # Ensure log directory exists (guard against bare filename with no dir component)
    log_dir = os.path.dirname(log_file)
    if log_dir:
        os.makedirs(log_dir, exist_ok=True)

    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)

    # Rotating file handler: 10MB max, keep 3 backups
    file_handler = RotatingFileHandler(
        log_file, maxBytes=10_000_000, backupCount=3, encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)

    logger.addHandler(console_handler)
    logger.addHandler(file_handler)

    return logger
