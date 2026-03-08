import httpx
import os
from typing import Optional

BASE_URL = "https://api.semanticscholar.org/graph/v1"

# Get API key from environment (optional but recommended)
API_KEY = os.getenv("SEMANTIC_SCHOLAR_API_KEY")


def _get_headers() -> dict:
    headers = {}
    if API_KEY:
        headers["x-api-key"] = API_KEY
    return headers


async def search_papers(
    query: str,
    limit: int = 10,
    fields: Optional[list[str]] = None
) -> dict:
    """
    Search for academic papers on Semantic Scholar.

    Args:
        query: Search query string
        limit: Max number of results (default 10, max 100)
        fields: Fields to return (e.g., title, abstract, authors, year, citationCount)
    """
    if fields is None:
        fields = ["title", "abstract", "authors", "year", "citationCount", "url", "paperId"]

    params = {
        "query": query,
        "limit": min(limit, 100),
        "fields": ",".join(fields)
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/paper/search", params=params)
        response.raise_for_status()
        return response.json()


async def get_paper(
    paper_id: str,
    fields: Optional[list[str]] = None
) -> dict:
    """
    Get details for a specific paper by ID.

    Args:
        paper_id: Semantic Scholar paper ID, DOI, or arXiv ID
        fields: Fields to return
    """
    if fields is None:
        fields = ["title", "abstract", "authors", "year", "citationCount",
                  "referenceCount", "url", "venue", "publicationDate"]

    params = {"fields": ",".join(fields)}

    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/paper/{paper_id}", params=params)
        response.raise_for_status()
        return response.json()


async def get_paper_citations(
    paper_id: str,
    limit: int = 10,
    fields: Optional[list[str]] = None
) -> dict:
    """
    Get papers that cite a given paper.

    Args:
        paper_id: Semantic Scholar paper ID
        limit: Max number of citations to return
        fields: Fields to return for each citing paper
    """
    if fields is None:
        fields = ["title", "authors", "year", "citationCount"]

    params = {
        "limit": min(limit, 100),
        "fields": ",".join(fields)
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/paper/{paper_id}/citations", params=params)
        response.raise_for_status()
        return response.json()


async def get_author(
    author_id: str,
    fields: Optional[list[str]] = None
) -> dict:
    """
    Get author information.

    Args:
        author_id: Semantic Scholar author ID
        fields: Fields to return
    """
    if fields is None:
        fields = ["name", "affiliations", "paperCount", "citationCount", "hIndex"]

    params = {"fields": ",".join(fields)}

    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/author/{author_id}", params=params)
        response.raise_for_status()
        return response.json()
