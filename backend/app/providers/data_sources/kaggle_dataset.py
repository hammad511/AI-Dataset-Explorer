import asyncio
import base64
import logging
import os
from typing import List, Dict, Any, Optional
import httpx
from backend.app.providers.data_sources.base import DataSourceAdapter
from backend.app.core.config import settings

logger = logging.getLogger(__name__)


def get_kaggle_auth_headers() -> Dict[str, str]:
    api_token = (settings.KAGGLE_API_TOKEN or os.getenv("KAGGLE_API_TOKEN") or "").strip()
    key = (settings.KAGGLE_KEY or os.getenv("KAGGLE_KEY") or "").strip()
    username = (settings.KAGGLE_USERNAME or os.getenv("KAGGLE_USERNAME") or "").strip()

    headers: Dict[str, str] = {
        "Accept": "application/json",
        "User-Agent": "AI-Dataset-Explorer/2.0 (FastAPI)",
    }

    if api_token:
        headers["Authorization"] = f"Bearer {api_token}"
    elif key.lower().startswith("kgat_"):
        headers["Authorization"] = f"Bearer {key}"
    elif username and key:
        creds = base64.b64encode(f"{username}:{key}".encode("utf-8")).decode("utf-8")
        headers["Authorization"] = f"Basic {creds}"

    return headers


def is_kaggle_configured() -> bool:
    return "Authorization" in get_kaggle_auth_headers()


class KaggleDatasetAdapter(DataSourceAdapter):
    """
    Adapter for Kaggle Datasets API.
    """

    @property
    def source_name(self) -> str:
        return "kaggle"

    async def search(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        headers = get_kaggle_auth_headers()
        if "Authorization" not in headers:
            return []

        url = "https://www.kaggle.com/api/v1/datasets/list"
        params = {"search": query, "page": 1, "pageSize": limit}

        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(url, params=params, headers=headers)
                    if resp.status_code in (401, 403):
                        logger.error(f"Kaggle API authentication failed (HTTP {resp.status_code}): {resp.text[:250]}")
                        return []
                    if resp.status_code in (429, 503) and attempt < 2:
                        delay = 0.5 * (2 ** attempt)
                        logger.warning(f"Kaggle API HTTP {resp.status_code}, retrying in {delay}s...")
                        await asyncio.sleep(delay)
                        continue
                    if resp.status_code == 200:
                        items = resp.json()
                        return [await self.normalize(item) for item in items[:limit]]
                    break
            except Exception as e:
                if attempt < 2:
                    await asyncio.sleep(0.5 * (2 ** attempt))
                    continue
                logger.warning(f"Kaggle search failed: {e}")

        return []

    async def fetch(self, resource_id: str) -> Optional[Dict[str, Any]]:
        return None

    async def normalize(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        ref = raw.get("ref") or (
            f"{raw.get('ownerRef')}/{raw.get('datasetSlug')}"
            if raw.get("ownerRef") and raw.get("datasetSlug")
            else ""
        ) or raw.get("id") or ""
        title = raw.get("title") or raw.get("datasetTitle") or ref
        tags = [
            (t if isinstance(t, str) else (t.get("name") or t.get("description") or ""))
            for t in (raw.get("tags") or [])
        ]
        tags = [t for t in tags if t]
        return {
            "id": f"kg_{ref.replace('/', '_')}",
            "source": "kaggle",
            "source_id": ref,
            "name": title,
            "slug": ref,
            "description": raw.get("description") or raw.get("subtitle") or f"Kaggle dataset: {title}",
            "canonical_url": raw.get("url") or f"https://www.kaggle.com/datasets/{ref}",
            "license": raw.get("licenseName") or "Community",
            "domain": "General AI",
            "subdomains": [],
            "tasks": tags[:5],
            "modalities": ["Tabular", "Image"],
            "num_samples": raw.get("downloadCount", 0),
            "size_gb": (raw.get("totalBytes") or 0) / (1024 * 1024 * 1024) if raw.get("totalBytes") else None,
            "format": [],
            "vote_count": raw.get("voteCount"),
            "usability_rating": raw.get("usabilityRating"),
        }

    async def health_check(self) -> bool:
        return is_kaggle_configured()
