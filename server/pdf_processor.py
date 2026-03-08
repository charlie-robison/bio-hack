"""
PDF Processing Pipeline

Handles:
1. Saving original PDF
2. Converting PDF pages to PNGs
3. Extracting embedded images via pdfimages
4. Running LlamaParse to get markdown
5. Saving metadata
"""

import os
from dotenv import load_dotenv
load_dotenv()
import uuid
import json
import subprocess
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional
import httpx

# Base filesystem path for runs
FS_BASE = Path(__file__).parent / "fs" / "runs"


def ensure_fs():
    """Ensure the filesystem directory exists."""
    FS_BASE.mkdir(parents=True, exist_ok=True)


def create_run(filename: str) -> tuple[str, Path]:
    """
    Create a new run directory.

    Returns:
        (run_id, run_path)
    """
    ensure_fs()
    run_id = str(uuid.uuid4())
    run_path = FS_BASE / run_id
    run_path.mkdir(parents=True, exist_ok=True)
    (run_path / "pages").mkdir(exist_ok=True)
    (run_path / "extracted_images").mkdir(exist_ok=True)

    return run_id, run_path


def save_pdf(run_path: Path, pdf_bytes: bytes) -> Path:
    """Save the original PDF."""
    pdf_path = run_path / "original.pdf"
    pdf_path.write_bytes(pdf_bytes)
    return pdf_path


def convert_pdf_to_images(run_path: Path) -> list[Path]:
    """
    Convert PDF pages to PNG images using pdf2image.

    Returns list of image paths.
    """
    from pdf2image import convert_from_path

    pdf_path = run_path / "original.pdf"
    pages_dir = run_path / "pages"

    # Convert PDF to images
    images = convert_from_path(str(pdf_path), dpi=150)

    image_paths = []
    for i, image in enumerate(images, start=1):
        img_path = pages_dir / f"page_{i:03d}.png"
        image.save(str(img_path), "PNG")
        image_paths.append(img_path)

    return image_paths


def extract_embedded_images(run_path: Path) -> list[Path]:
    """
    Extract embedded images from PDF using pdfimages (poppler).

    Returns list of extracted image paths.
    """
    pdf_path = run_path / "original.pdf"
    output_dir = run_path / "extracted_images"
    output_prefix = output_dir / "img"

    # Check if pdfimages is available
    if not shutil.which("pdfimages"):
        print("Warning: pdfimages not found. Skipping image extraction.")
        return []

    # Run pdfimages to extract all images as PNG
    try:
        subprocess.run(
            ["pdfimages", "-png", str(pdf_path), str(output_prefix)],
            check=True,
            capture_output=True
        )
    except subprocess.CalledProcessError as e:
        print(f"pdfimages error: {e.stderr.decode()}")
        return []

    # Collect extracted images
    extracted = sorted(output_dir.glob("img-*.png"))
    return extracted


async def run_llamaparse(pdf_bytes: bytes) -> str:
    """
    Run LlamaParse on PDF to extract markdown.

    Returns markdown string.
    """
    api_key = os.getenv("LLAMA_CLOUD_API_KEY")
    if not api_key:
        raise ValueError("LLAMA_CLOUD_API_KEY not set")

    # LlamaParse API endpoint
    upload_url = "https://api.cloud.llamaindex.ai/api/parsing/upload"

    async with httpx.AsyncClient(timeout=120.0) as client:
        # Upload the PDF
        files = {"file": ("document.pdf", pdf_bytes, "application/pdf")}
        headers = {"Authorization": f"Bearer {api_key}"}

        upload_response = await client.post(
            upload_url,
            files=files,
            headers=headers,
            data={"result_type": "markdown"}
        )
        upload_response.raise_for_status()
        job_data = upload_response.json()
        job_id = job_data["id"]

        # Poll for completion
        status_url = f"https://api.cloud.llamaindex.ai/api/parsing/job/{job_id}"

        while True:
            status_response = await client.get(status_url, headers=headers)
            status_response.raise_for_status()
            status_data = status_response.json()

            if status_data["status"] == "SUCCESS":
                break
            elif status_data["status"] == "ERROR":
                raise Exception(f"LlamaParse failed: {status_data.get('error', 'Unknown error')}")

            # Wait before polling again
            import asyncio
            await asyncio.sleep(1)

        # Get the result
        result_url = f"https://api.cloud.llamaindex.ai/api/parsing/job/{job_id}/result/markdown"
        result_response = await client.get(result_url, headers=headers)
        result_response.raise_for_status()

        return result_response.json()["markdown"]


def save_metadata(run_path: Path, filename: str, page_count: int, extracted_image_count: int) -> dict:
    """Save run metadata."""
    metadata = {
        "run_id": run_path.name,
        "original_filename": filename,
        "created_at": datetime.now().isoformat(),
        "page_count": page_count,
        "extracted_image_count": extracted_image_count,
        "files": {
            "pdf": "original.pdf",
            "markdown": "content.md",
            "pages_dir": "pages/",
            "images_dir": "extracted_images/"
        }
    }

    metadata_path = run_path / "metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2))

    return metadata


async def process_pdf(filename: str, pdf_bytes: bytes) -> dict:
    """
    Full PDF processing pipeline.

    Args:
        filename: Original filename
        pdf_bytes: PDF file content

    Returns:
        Dictionary with run info and paths
    """
    # Create run
    run_id, run_path = create_run(filename)

    try:
        # Save original PDF
        save_pdf(run_path, pdf_bytes)

        # Convert to images
        page_images = convert_pdf_to_images(run_path)

        # Extract embedded images
        extracted_images = extract_embedded_images(run_path)

        # Run LlamaParse
        markdown = await run_llamaparse(pdf_bytes)
        content_path = run_path / "content.md"
        content_path.write_text(markdown)

        # Save metadata
        metadata = save_metadata(
            run_path,
            filename,
            page_count=len(page_images),
            extracted_image_count=len(extracted_images)
        )

        return {
            "run_id": run_id,
            "run_path": str(run_path),
            "metadata": metadata,
            "markdown_preview": markdown[:500] + "..." if len(markdown) > 500 else markdown
        }

    except Exception as e:
        # Clean up on failure
        shutil.rmtree(run_path, ignore_errors=True)
        raise e


def get_run(run_id: str) -> Optional[dict]:
    """
    Get info about an existing run.

    Returns None if run doesn't exist.
    """
    run_path = FS_BASE / run_id
    if not run_path.exists():
        return None

    metadata_path = run_path / "metadata.json"
    if metadata_path.exists():
        metadata = json.loads(metadata_path.read_text())
    else:
        metadata = {}

    content_path = run_path / "content.md"
    markdown = content_path.read_text() if content_path.exists() else None

    return {
        "run_id": run_id,
        "run_path": str(run_path),
        "metadata": metadata,
        "markdown": markdown,
        "pages": sorted([p.name for p in (run_path / "pages").glob("*.png")]),
        "extracted_images": sorted([p.name for p in (run_path / "extracted_images").glob("*.png")])
    }


def list_runs() -> list[dict]:
    """List all runs."""
    ensure_fs()
    runs = []
    for run_dir in sorted(FS_BASE.iterdir(), reverse=True):
        if run_dir.is_dir():
            metadata_path = run_dir / "metadata.json"
            if metadata_path.exists():
                metadata = json.loads(metadata_path.read_text())
                runs.append({
                    "run_id": run_dir.name,
                    "created_at": metadata.get("created_at"),
                    "original_filename": metadata.get("original_filename")
                })
    return runs
