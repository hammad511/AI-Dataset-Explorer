import logging
from typing import List, Dict, Any, Optional
import httpx
from backend.app.providers.data_sources.base import DataSourceAdapter
from backend.app.providers.data_sources.arxiv_paper import get_polite_email

logger = logging.getLogger(__name__)

CROSSREF_SELECT_FIELDS = "DOI,title,author,published,abstract,is-referenced-by-count,URL,container-title"


def get_crossref_headers() -> Dict[str, str]:
    email = get_polite_email()
    return {
        "Accept": "application/json",
        "User-Agent": f"AI-Dataset-Explorer/1.0 (mailto:{email})",
    }


class CrossrefPaperAdapter(DataSourceAdapter):
    """
    Adapter for Crossref Works API.
    """

    @property
    def source_name(self) -> str:
        return "crossref"

    async def search(self, query: str, limit: int = 15) -> List[Dict[str, Any]]:
        url = "https://api.crossref.org/works"
        email = get_polite_email()
        params = {
            "query": query,
            "rows": limit,
            "select": CROSSREF_SELECT_FIELDS,
            "mailto": email,
        }

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url, params=params, headers=get_crossref_headers())
                if resp.status_code == 200:
                    data = resp.json()
                    items = (data.get("message") or {}).get("items", [])
                    return [await self.normalize(item) for item in items]
        except Exception as e:
            logger.warning(f"Crossref search failed: {e}")

        return []

    async def fetch(self, resource_id: str) -> Optional[Dict[str, Any]]:
        clean_doi = resource_id.replace("crossref_", "")
        url = f"https://api.crossref.org/works/{clean_doi}"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    url,
                    params={"mailto": get_polite_email()},
                    headers=get_crossref_headers(),
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return await self.normalize(data.get("message") or {})
        except Exception as e:
            logger.warning(f"Crossref fetch failed: {e}")
        return None

    async def normalize(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        doi = raw.get("DOI") or ""
        titles = raw.get("title") or []
        title = titles[0] if titles else "Untitled Paper"

        authors = []
        for a in raw.get("author", []):
            given = a.get("given", "")
            family = a.get("family", "")
            full = f"{given} {family}".strip() or a.get("name", "")
            if full:
                authors.append(full)

        pub_parts = (
            (raw.get("published") or {}).get("date-parts")
            or (raw.get("published-print") or {}).get("date-parts")
            or (raw.get("published-online") or {}).get("date-parts")
            or (raw.get("created") or {}).get("date-parts")
            or [[]]
        )
        year = pub_parts[0][0] if pub_parts and pub_parts[0] else None

        container = raw.get("container-title") or []
        venue = container[0] if container else "Crossref Publication"

        return {
            "id": f"crossref_{doi.replace('/', '_')}",
            "title": title,
            "abstract": raw.get("abstract") or "",
            "authors": authors[:5],
            "venue": venue,
            "year": year,
            "publication_date": f"{year}-01-01" if year else None,
            "doi": doi,
            "url": f"https://doi.org/{doi}" if doi else raw.get("URL"),
            "pdf_url": None,
            "citation_count": raw.get("is-referenced-by-count", 0),
            "source": "crossref",
            "source_id": doi,
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
                resp = await client.get(
                    "https://api.crossref.org/works?rows=1",
                    params={"mailto": get_polite_email()},
                    headers=get_crossref_headers(),
                )
                return resp.status_code == 200
        except Exception:
            return False
