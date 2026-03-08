from mcp.server.fastmcp import FastMCP
from tools.semantic_scholar import (
    search_papers,
    get_paper,
    get_paper_citations,
    get_author,
)

# Initialize MCP server
mcp = FastMCP("bio-hack")


@mcp.tool()
async def semantic_scholar_search(query: str, limit: int = 10) -> dict:
    """
    Search for academic papers on Semantic Scholar.

    Args:
        query: Search query (e.g., "CRISPR gene editing", "protein folding")
        limit: Maximum number of results to return (default 10, max 100)

    Returns:
        Dictionary containing matching papers with titles, abstracts, authors, etc.
    """
    return await search_papers(query, limit)


@mcp.tool()
async def semantic_scholar_paper(paper_id: str) -> dict:
    """
    Get detailed information about a specific paper.

    Args:
        paper_id: Paper identifier - can be Semantic Scholar ID, DOI (e.g., "10.1038/..."),
                  or arXiv ID (e.g., "arXiv:2106.01234")

    Returns:
        Dictionary containing paper details including title, abstract, authors,
        citation count, venue, and publication date.
    """
    return await get_paper(paper_id)


@mcp.tool()
async def semantic_scholar_citations(paper_id: str, limit: int = 10) -> dict:
    """
    Get papers that cite a given paper.

    Args:
        paper_id: Semantic Scholar paper ID
        limit: Maximum number of citing papers to return (default 10)

    Returns:
        Dictionary containing papers that cite the specified paper.
    """
    return await get_paper_citations(paper_id, limit)


@mcp.tool()
async def semantic_scholar_author(author_id: str) -> dict:
    """
    Get information about an author.

    Args:
        author_id: Semantic Scholar author ID

    Returns:
        Dictionary containing author info including name, affiliations,
        paper count, citation count, and h-index.
    """
    return await get_author(author_id)


if __name__ == "__main__":
    mcp.run()
