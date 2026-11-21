import logging
import os
from typing import List, Dict, Any, Optional
import httpx
from backend.app.providers.data_sources.base import DataSourceAdapter
from backend.app.core.config import settings

logger = logging.getLogger(__name__)


def get_openalex_params(extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    params: Dict[str, Any] = dict(extra or {})
    api_key = (settings.OPENALEX_API_KEY or os.getenv("OPENALEX_API_KEY") or "").strip()
    email = (settings.OPENALEX_EMAIL or os.getenv("OPENALEX_EMAIL") or "research@example.com").strip()
    if api_key:
        params["api_key"] = api_key
    if email:
        params["mailto"] = email
    return params


class OpenAlexPaperAdapter(DataSourceAdapter):
    """
    Adapter for OpenAlex API.
    """

    @property
    def source_name(self) -> str:
        return "openalex"

    async def search(self, query: str, limit: int = 15) -> List[Dict[str, Any]]:
        url = "https://api.openalex.org/works"
        params = get_openalex_params({
            "search": query,
            "per_page": limit,
        })

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    items = data.get("results", [])
                    return [await self.normalize(item) for item in items]
        except Exception as e:
            logger.warning(f"OpenAlex search failed: {e}")

        return []

    async def fetch(self, resource_id: str) -> Optional[Dict[str, Any]]:
        clean_id = resource_id.replace("openalex_", "").replace("https://openalex.org/", "")
        url = f"https://api.openalex.org/works/{clean_id}"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url, params=get_openalex_params())
                if resp.status_code == 200:
                    return await self.normalize(resp.json())
        except Exception as e:
            logger.warning(f"OpenAlex fetch failed: {e}")
        return None

    async def normalize(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        item_id = raw.get("id") or ""
        short_id = item_id.split("/")[-1] if "/" in item_id else item_id
        
        # Invert abstract if needed
        abstract = ""
        inv_index = raw.get("abstract_inverted_index")
        if inv_index and isinstance(inv_index, dict):
            word_positions = []
            for word, pos_list in inv_index.items():
                for pos in pos_list:
                    word_positions.append((pos, word))
            word_positions.sort(key=lambda x: x[0])
            abstract = " ".join([w[1] for w in word_positions[:120]])

        authors = [
            (a.get("author") or {}).get("display_name", "")
            for a in raw.get("authorships", [])
            if (a.get("author") or {}).get("display_name")
        ]

        primary_loc = raw.get("primary_location") or {}
        pdf_url = (raw.get("open_access") or {}).get("oa_url") or primary_loc.get("pdf_url")

        return {
            "id": f"openalex_{short_id}",
            "title": raw.get("display_name") or raw.get("title") or "Untitled Paper",
            "abstract": abstract,
            "authors": authors[:5],
            "venue": (primary_loc.get("source") or {}).get("display_name") or "OpenAlex Index",
            "year": raw.get("publication_year"),
            "publication_date": raw.get("publication_date"),
            "doi": raw.get("doi"),
            "openalex_id": short_id,
            "url": primary_loc.get("landing_page_url") or raw.get("doi") or f"https://openalex.org/{short_id}",
            "pdf_url": pdf_url,
            "citation_count": raw.get("cited_by_count", 0),
            "source": "openalex",
            "source_id": short_id,
            "paper_type": "METHOD",
            "tasks": [],
            "domains": [],
            "methods": [],
            "dataset_ids": [],
            "model_ids": [],
        }

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get("https://api.openalex.org/works?per_page=1")
                return resp.status_code == 200
        except Exception:
            return False
