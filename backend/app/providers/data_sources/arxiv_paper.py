import asyncio
import logging
import os
import re
import time
import xml.etree.ElementTree as ET
from typing import List, Dict, Any, Optional
import httpx
from backend.app.providers.data_sources.base import DataSourceAdapter
from backend.app.core.config import settings

logger = logging.getLogger(__name__)

_last_arxiv_request_ts: float = 0.0
_arxiv_lock = asyncio.Lock()
ARXIV_MIN_INTERVAL_SEC = 3.0


def get_polite_email() -> str:
    return (
        os.getenv("CONTACT_EMAIL")
        or os.getenv("OPENALEX_EMAIL")
        or settings.CONTACT_EMAIL
        or settings.OPENALEX_EMAIL
        or "research@example.com"
    ).strip()


def get_arxiv_headers() -> Dict[str, str]:
    return {
        "Accept": "application/atom+xml, application/xml, text/xml",
        "User-Agent": f"AI-Dataset-Explorer/1.0 (mailto:{get_polite_email()})",
    }


def normalize_arxiv_id(raw_id: str) -> str:
    if not raw_id:
        return ""
    clean = raw_id.split("/abs/")[-1] if "/abs/" in raw_id else raw_id
    clean = re.sub(r"v\d+$", "", clean.strip(), flags=re.IGNORECASE)
    return clean


async def _wait_for_arxiv_slot() -> None:
    global _last_arxiv_request_ts
    async with _arxiv_lock:
        now = time.monotonic()
        elapsed = now - _last_arxiv_request_ts
        if _last_arxiv_request_ts > 0 and elapsed < ARXIV_MIN_INTERVAL_SEC:
            await asyncio.sleep(ARXIV_MIN_INTERVAL_SEC - elapsed)
        _last_arxiv_request_ts = time.monotonic()


class ArxivPaperAdapter(DataSourceAdapter):
    """
    Adapter for arXiv API.
    """

    @property
    def source_name(self) -> str:
        return "arxiv"

    async def search(self, query: str, limit: int = 15) -> List[Dict[str, Any]]:
        cleaned_q = re.sub(r"[^\w\s]", " ", query).strip()
        terms = [t for t in cleaned_q.split() if len(t) > 2][:6]
        search_query = "+AND+".join(terms) if terms else "machine+learning"

        url = f"https://export.arxiv.org/api/query?search_query=all:{search_query}&start=0&max_results={limit}&sortBy=relevance"

        try:
            await _wait_for_arxiv_slot()
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers=get_arxiv_headers())
                if resp.status_code == 200:
                    return self._parse_atom(resp.text)
        except Exception as e:
            logger.warning(f"arXiv search failed: {e}")

        return []

    async def fetch(self, resource_id: str) -> Optional[Dict[str, Any]]:
        clean_id = normalize_arxiv_id(resource_id.replace("arxiv_", ""))
        url = f"https://export.arxiv.org/api/query?id_list={clean_id}"
        try:
            await _wait_for_arxiv_slot()
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url, headers=get_arxiv_headers())
                if resp.status_code == 200:
                    items = self._parse_atom(resp.text)
                    return items[0] if items else None
        except Exception as e:
            logger.warning(f"arXiv fetch failed: {e}")
        return None

    def _parse_atom(self, xml_text: str) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        seen_ids = set()
        try:
            root = ET.fromstring(xml_text)
            ns = {"atom": "http://www.w3.org/2005/Atom"}

            for entry in root.findall("atom:entry", ns):
                raw_id = entry.findtext("atom:id", default="", namespaces=ns)
                arxiv_id = normalize_arxiv_id(raw_id)
                if not arxiv_id or arxiv_id in seen_ids:
                    continue
                seen_ids.add(arxiv_id)

                title = entry.findtext("atom:title", default="", namespaces=ns).replace("\n", " ").strip()
                summary = entry.findtext("atom:summary", default="", namespaces=ns).replace("\n", " ").strip()
                published = entry.findtext("atom:published", default="", namespaces=ns)
                year = int(published[:4]) if published and len(published) >= 4 else 2024

                authors = [
                    a.findtext("atom:name", default="", namespaces=ns)
                    for a in entry.findall("atom:author", ns)
                ]

                results.append({
                    "id": f"arxiv_{arxiv_id.replace('/', '_')}",
                    "title": title,
                    "abstract": summary,
                    "authors": authors[:5],
                    "venue": "arXiv preprint",
                    "year": year,
                    "publication_date": published[:10] if published else None,
                    "arxiv_id": arxiv_id,
                    "url": f"https://arxiv.org/abs/{arxiv_id}",
                    "pdf_url": f"https://arxiv.org/pdf/{arxiv_id}.pdf",
                    "citation_count": 0,
                    "source": "arxiv",
                    "source_id": arxiv_id,
                    "paper_type": "METHOD",
                    "tasks": [],
                    "domains": [],
                    "methods": [],
                    "dataset_ids": [],
                    "model_ids": [],
                })
        except Exception as e:
            logger.warning(f"Error parsing arXiv XML: {e}")

        return results

    async def normalize(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        return raw

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(
                    "https://export.arxiv.org/api/query?search_query=all:electron&max_results=1",
                    headers=get_arxiv_headers(),
                )
                return resp.status_code == 200
        except Exception:
            return False
