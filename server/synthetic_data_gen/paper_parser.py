"""
Paper Parser (Step 1a)
======================

Handles reading research papers from various sources (URLs, PDF files,
text files) and preparing them for schema extraction by Claude Opus.

This module is responsible for:
    - Fetching papers from URLs (HTML pages or PDF links)
    - Reading local PDF files and extracting text content
    - Reading plain text / markdown files
    - Cleaning and normalizing extracted text
"""

from __future__ import annotations
import io
import logging
from pathlib import Path
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)


class PaperParser:
    """
    Parses research papers from URLs, PDF files, or raw text into
    clean text suitable for LLM consumption.

    Supports:
        - URLs to HTML pages (e.g., PubMed, arXiv abstract pages)
        - URLs to PDF files (e.g., direct arXiv PDF links)
        - Local PDF files (.pdf) via PyPDF2
        - Local text files (.txt, .md)

    Example:
        parser = PaperParser()
        text = parser.parse_url("https://arxiv.org/abs/2301.00001")
        text = parser.parse("path/to/paper.pdf")
    """

    SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".md"}

    def parse_url(self, url: str) -> str:
        """
        Fetch and parse a research paper from a URL.

        Handles both HTML pages (extracts readable text) and direct
        PDF links (downloads and extracts text from the PDF).

        Args:
            url: URL to the research paper. Can be:
                - An HTML page (e.g., arXiv abstract, PubMed)
                - A direct PDF link (e.g., arxiv.org/pdf/...)

        Returns:
            Extracted and cleaned text content.

        Raises:
            httpx.HTTPError: If the URL cannot be fetched.
            ValueError: If the content cannot be parsed.
        """
        logger.info(f"Fetching paper from URL: {url}")

        response = httpx.get(
            url,
            follow_redirects=True,
            timeout=60.0,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; BioHack-SyntheticDataGen/1.0)"
            },
        )
        response.raise_for_status()

        content_type = response.headers.get("content-type", "")

        if "application/pdf" in content_type or url.lower().endswith(".pdf"):
            logger.info("Detected PDF content, extracting text")
            return self._parse_pdf_bytes(response.content)
        else:
            logger.info("Detected HTML content, extracting text")
            return self._parse_html(response.text)

    def parse(self, file_path: str) -> str:
        """
        Parse a research paper from a local file.

        Args:
            file_path: Path to the paper file (PDF, TXT, or MD).

        Returns:
            Extracted and cleaned text content of the paper.

        Raises:
            FileNotFoundError: If the file doesn't exist.
            ValueError: If the file type is not supported.
        """
        path = Path(file_path)

        if not path.exists():
            raise FileNotFoundError(f"Paper not found: {file_path}")

        if path.suffix.lower() not in self.SUPPORTED_EXTENSIONS:
            raise ValueError(
                f"Unsupported file type: {path.suffix}. "
                f"Supported: {self.SUPPORTED_EXTENSIONS}"
            )

        logger.info(f"Parsing paper: {file_path}")

        if path.suffix.lower() == ".pdf":
            return self._parse_pdf(path)
        else:
            return self._parse_text(path)

    def parse_from_string(self, text: str) -> str:
        """
        Accept raw text content directly (e.g., if the paper is
        already extracted or pasted in).

        Args:
            text: Raw text content of the paper.

        Returns:
            Cleaned text content.
        """
        return self._clean_text(text)

    def _parse_html(self, html: str) -> str:
        """
        Extract readable text from an HTML page.

        Uses a simple tag-stripping approach. Falls back to raw text
        if beautifulsoup4 is not installed.

        Args:
            html: Raw HTML content.

        Returns:
            Cleaned text extracted from the HTML.
        """
        try:
            from bs4 import BeautifulSoup

            soup = BeautifulSoup(html, "html.parser")

            # Remove script and style elements
            for element in soup(["script", "style", "nav", "header", "footer"]):
                element.decompose()

            text = soup.get_text(separator="\n")
        except ImportError:
            # Fallback: basic tag stripping
            import re

            text = re.sub(r"<[^>]+>", "\n", html)

        return self._clean_text(text)

    def _parse_pdf_bytes(self, pdf_bytes: bytes) -> str:
        """
        Extract text from PDF bytes (e.g., downloaded from a URL).

        Args:
            pdf_bytes: Raw PDF file content as bytes.

        Returns:
            Concatenated text from all pages.
        """
        try:
            from PyPDF2 import PdfReader
        except ImportError:
            raise ImportError(
                "PyPDF2 is required for PDF parsing. "
                "Install it with: pip install PyPDF2"
            )

        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages = []

        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            if text:
                pages.append(f"--- Page {i + 1} ---\n{text}")

        full_text = "\n\n".join(pages)
        logger.info(f"Extracted {len(reader.pages)} pages from PDF")

        return self._clean_text(full_text)

    def _parse_pdf(self, path: Path) -> str:
        """
        Extract text from a local PDF file.

        Args:
            path: Path to the PDF file.

        Returns:
            Concatenated text from all pages.
        """
        return self._parse_pdf_bytes(path.read_bytes())

    def _parse_text(self, path: Path) -> str:
        """
        Read a plain text or markdown file.

        Args:
            path: Path to the text file.

        Returns:
            Cleaned file contents.
        """
        text = path.read_text(encoding="utf-8")
        return self._clean_text(text)

    def _clean_text(self, text: str) -> str:
        """
        Clean and normalize extracted text.

        Removes excessive whitespace and normalizes line breaks
        while preserving paragraph structure.

        Args:
            text: Raw extracted text.

        Returns:
            Cleaned text.
        """
        lines = text.splitlines()
        cleaned_lines = []

        for line in lines:
            stripped = line.strip()
            if stripped:
                cleaned_lines.append(stripped)
            elif cleaned_lines and cleaned_lines[-1] != "":
                cleaned_lines.append("")

        return "\n".join(cleaned_lines)
