# utils/config.py
import yaml
from models import CrawlerConfig


def load_config(path: str = "config.yaml") -> CrawlerConfig:
    """Load and validate crawler configuration from YAML file.

    Raises pydantic.ValidationError if config is malformed.
    Raises FileNotFoundError if config file does not exist.
    """
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return CrawlerConfig(**data)
