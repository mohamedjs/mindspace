import asyncio
import logging

import aioboto3
from botocore.exceptions import ClientError

from app.core.config import settings

logger = logging.getLogger("seeds.bucket")


async def ensure_recordings_bucket() -> None:
    session = aioboto3.Session()
    async with session.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
        region_name=settings.s3_region,
    ) as s3:
        try:
            await s3.head_bucket(Bucket=settings.s3_bucket)
            logger.info("Bucket %s already exists", settings.s3_bucket)
        except ClientError:
            try:
                await s3.create_bucket(Bucket=settings.s3_bucket)
                logger.info("Bucket %s created successfully", settings.s3_bucket)
            except Exception as e:
                logger.error("Failed to create bucket %s: %s", settings.s3_bucket, e)
                raise


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(ensure_recordings_bucket())


if __name__ == "__main__":
    main()
