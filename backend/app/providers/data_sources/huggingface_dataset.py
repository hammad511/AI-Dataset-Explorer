import asyncio
import logging
import os
from typing import List, Dict, Any, Optional
import httpx
from backend.app.providers.data_sources.base import DataSourceAdapter
from backend.app.core.config import settings

logger = logging.getLogger(__name__)


def get_huggingface_token() -> str:
    return (
        settings.HUGGINGFACE_TOKEN
        or os.getenv("HF_TOKEN")
        or os.getenv("HUGGING_FACE_TOKEN")
        or os.getenv("HUGGINGFACE_TOKEN")
        or ""
    ).strip()


def get_huggingface_headers() -> Dict[str, str]:
    token = get_huggingface_token()
    headers = {"Accept": "application/json", "User-Agent": "AI-Dataset-Explorer/2.0 (FastAPI)"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    else:
        logger.warning("[Hugging Face API] Running unauthenticated (HF_TOKEN is not configured).")
    return headers


class HuggingFaceDatasetAdapter(DataSourceAdapter):
    """
    Adapter for Hugging Face Datasets API.
    """

    @property
    def source_name(self) -> str:
        return "huggingface"

    async def search(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        headers = get_huggingface_headers()
        url = (
            "https://huggingface.co/api/datasets"
            f"?search={query}&limit={limit}"
            "&expand[]=downloads&expand[]=likes&expand[]=tags&expand[]=pipeline_tag&expand[]=cardData&expand[]=siblings"
        )

        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(url, headers=headers)
                    if resp.status_code in (429, 503) and attempt < 2:
                        delay = 0.5 * (2 ** attempt)
                        logger.warning(f"HuggingFace dataset API HTTP {resp.status_code}, retrying in {delay}s...")
                        await asyncio.sleep(delay)
                        continue
                    if resp.status_code == 200:
                        items = resp.json()
                        return [await self.normalize(item) for item in items]
                    break
            except Exception as e:
                if attempt < 2:
                    await asyncio.sleep(0.5 * (2 ** attempt))
                    continue
                logger.warning(f"HuggingFace dataset search failed: {e}")

        return []

    async def fetch(self, resource_id: str) -> Optional[Dict[str, Any]]:
        headers = get_huggingface_headers()
        url = f"https://huggingface.co/api/datasets/{resource_id}"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    return await self.normalize(resp.json())
        except Exception as e:
            logger.warning(f"HuggingFace dataset fetch failed: {e}")
        return None

    async def normalize(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        item_id = raw.get("id") or raw.get("_id") or ""
        desc = raw.get("description") or (raw.get("cardData") or {}).get("description") or ""
        tags = raw.get("tags") or []
        
        # Modalities extraction
        modalities = []
        for tag in tags:
            if tag in ("image", "vision", "cv"):
                modalities.append("Image")
            elif tag in ("text", "nlp", "translation"):
                modalities.append("Text")
            elif tag in ("audio", "speech", "sound"):
                modalities.append("Audio")
            elif tag in ("tabular", "structured"):
                modalities.append("Tabular")

        return {
            "id": f"hf_{item_id.replace('/', '_')}",
            "source": "huggingface",
            "source_id": item_id,
            "name": item_id.split("/")[-1] if "/" in item_id else item_id,
            "slug": item_id,
            "description": desc,
            "canonical_url": f"https://huggingface.co/datasets/{item_id}",
            "license": (raw.get("cardData") or {}).get("license") or "open",
            "domain": "General AI",
            "subdomains": [],
            "tasks": [t for t in tags if "task" in t or t in ("classification", "segmentation", "detection")],
            "modalities": modalities or ["Text"],
            "num_samples": raw.get("downloads", 0),
            "size_gb": None,
            "format": [],
        }

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get("https://huggingface.co/api/datasets?limit=1", headers=get_huggingface_headers())
                return resp.status_code == 200
        except Exception:
            return False
