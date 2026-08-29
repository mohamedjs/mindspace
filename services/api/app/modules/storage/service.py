import os
from uuid import UUID, uuid4

import aioboto3
from botocore.config import Config

from app.core.config import settings


class StorageService:
    def __init__(self) -> None:
        self._session = aioboto3.Session()
        self._endpoint_url = settings.s3_endpoint_url
        self._public_endpoint = settings.s3_public_endpoint_url or settings.s3_endpoint_url
        self._bucket = settings.s3_bucket
        self._region = settings.s3_region
        self._access_key = settings.s3_access_key_id
        self._secret_key = settings.s3_secret_access_key
        self._boto_config = Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
        )

    def _get_client(self):
        return self._session.client(
            "s3",
            endpoint_url=self._endpoint_url,
            aws_access_key_id=self._access_key,
            aws_secret_access_key=self._secret_key,
            region_name=self._region,
            config=self._boto_config,
        )

    async def generate_presigned_upload_url(
        self,
        user_id: UUID,
        space_id: UUID,
        filename: str,
        content_type: str = "audio/m4a",
    ) -> tuple[str, str]:
        ext = os.path.splitext(filename)[1] or ".m4a"
        file_id = uuid4()
        storage_path = f"recordings/{user_id}/{space_id}/{file_id}{ext}"

        async with self._get_client() as s3:
            url = await s3.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": self._bucket,
                    "Key": storage_path,
                    "ContentType": content_type,
                },
                ExpiresIn=settings.s3_presign_ttl_seconds,
            )

        # Replace internal endpoint with public endpoint if needed
        if self._public_endpoint != self._endpoint_url:
            url = url.replace(self._endpoint_url, self._public_endpoint)

        return url, storage_path

    async def generate_presigned_download_url(self, storage_path: str) -> str:
        async with self._get_client() as s3:
            url = await s3.generate_presigned_url(
                ClientMethod="get_object",
                Params={
                    "Bucket": self._bucket,
                    "Key": storage_path,
                },
                ExpiresIn=settings.s3_presign_ttl_seconds,
            )

        if self._public_endpoint != self._endpoint_url:
            url = url.replace(self._endpoint_url, self._public_endpoint)

        return url

    async def upload_bytes(
        self,
        storage_path: str,
        data: bytes,
        content_type: str = "audio/m4a",
    ) -> None:
        async with self._get_client() as s3:
            await s3.put_object(
                Bucket=self._bucket,
                Key=storage_path,
                Body=data,
                ContentType=content_type,
            )

    async def download_bytes(self, storage_path: str) -> bytes:
        async with self._get_client() as s3:
            resp = await s3.get_object(Bucket=self._bucket, Key=storage_path)
            async with resp["Body"] as stream:
                return await stream.read()

    async def delete_file(self, storage_path: str) -> None:
        async with self._get_client() as s3:
            await s3.delete_object(Bucket=self._bucket, Key=storage_path)
