from enum import StrEnum


class RecordingStatus(StrEnum):
    recorded = "recorded"
    uploading = "uploading"
    transcribing = "transcribing"
    transcribed = "transcribed"
    failed = "failed"
    extracting = "extracting"
    completed = "completed"
