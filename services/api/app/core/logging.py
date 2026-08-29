import logging
import re

SENSITIVE_PATTERNS = [
    re.compile(
        r"(?i)(api[_-]?key|apikey|encrypted[_-]?key|password|authorization|secret|token)\s*[:=]\s*['\"]?([^\s,'\"]+)"
    ),
]


class RedactingFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        msg = super().format(record)
        for pattern in SENSITIVE_PATTERNS:
            msg = pattern.sub(r"\1: [REDACTED]", msg)
        return msg


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    formatter = RedactingFormatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(level.upper())
    root_logger.handlers = [handler]


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
