from pydantic import BaseModel


class PresignedUploadRequest(BaseModel):
    filename: str
    content_type: str = "audio/m4a"


class PresignedUploadOut(BaseModel):
    upload_url: str
    storage_path: str


class PresignedDownloadOut(BaseModel):
    download_url: str
