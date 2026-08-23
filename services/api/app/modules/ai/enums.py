from enum import StrEnum


class AiActionKind(StrEnum):
    extract_thoughts = "extract_thoughts"
    detect_relations = "detect_relations"
    thought_evolution = "thought_evolution"
    weekly_digest = "weekly_digest"


class AiActionStatus(StrEnum):
    pending = "pending"
    proposed = "proposed"
    accepted = "accepted"
    partially_accepted = "partially_accepted"
    rejected = "rejected"
    undone = "undone"
    failed = "failed"


class ProviderId(StrEnum):
    openrouter = "openrouter"
    openai = "openai"
    google = "google"
    anthropic = "anthropic"
    nvidia = "nvidia"
    custom = "custom"


class ModelKind(StrEnum):
    chat = "chat"
    transcribe = "transcribe"
