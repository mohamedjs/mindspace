import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings


def _get_aesgcm() -> AESGCM:
    key_bytes = base64.b64decode(settings.byok_master_key)
    if len(key_bytes) != 32:
        raise ValueError(f"BYOK_MASTER_KEY must be exactly 32 bytes (got {len(key_bytes)})")
    return AESGCM(key_bytes)


def encrypt_api_key(plaintext_key: str) -> bytes:
    aesgcm = _get_aesgcm()
    nonce = os.urandom(12)  # 96-bit standard nonce for GCM
    data = plaintext_key.encode("utf-8")
    ciphertext = aesgcm.encrypt(nonce, data, None)
    return nonce + ciphertext


def decrypt_api_key(encrypted_blob: bytes) -> str:
    if len(encrypted_blob) < 12:
        raise ValueError("Invalid encrypted data (too short)")
    aesgcm = _get_aesgcm()
    nonce = encrypted_blob[:12]
    ciphertext = encrypted_blob[12:]
    decrypted_bytes = aesgcm.decrypt(nonce, ciphertext, None)
    return decrypted_bytes.decode("utf-8")


def generate_key_hint(plaintext_key: str) -> str:
    clean = plaintext_key.strip()
    if len(clean) <= 4:
        return f"...{clean}"
    return f"...{clean[-4:]}"
