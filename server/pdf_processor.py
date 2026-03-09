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
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Optional, Callable
import httpx

# Base filesystem path for runs
FS_BASE = Path(__file__).parent / "fs" / "runs"

# Log buffer for streaming logs per run_id
_log_buffers: dict[str, list[dict]] = defaultdict(list)
_log_subscribers: dict[str, list[Callable]] = defaultdict(list)


def emit_log(run_id: str, message: str, level: str = "info", stage: str = ""):
    """Emit a log message for a run."""
    log_entry = {
        "timestamp": time.time(),
        "level": level,
        "stage": stage,
        "message": message,
    }
    _log_buffers[run_id].append(log_entry)
    # Notify any subscribers
    for callback in _log_subscribers.get(run_id, []):
        try:
            callback(log_entry)
        except Exception:
            pass


def get_logs(run_id: str) -> list[dict]:
    """Get all logs for a run."""
    return _log_buffers.get(run_id, [])


def subscribe_logs(run_id: str, callback: Callable):
    """Subscribe to log updates for a run."""
    _log_subscribers[run_id].append(callback)


def unsubscribe_logs(run_id: str, callback: Callable):
    """Unsubscribe from log updates."""
    if callback in _log_subscribers.get(run_id, []):
        _log_subscribers[run_id].remove(callback)


def clear_logs(run_id: str):
    """Clear logs for a run."""
    if run_id in _log_buffers:
        del _log_buffers[run_id]
    if run_id in _log_subscribers:
        del _log_subscribers[run_id]


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


def convert_pdf_to_images(run_path: Path, run_id: str = None) -> list[Path]:
    """
    Convert PDF pages to PNG images using pdf2image.

    Returns list of image paths.
    """
    from pdf2image import convert_from_path

    pdf_path = run_path / "original.pdf"
    pages_dir = run_path / "pages"

    if run_id:
        emit_log(run_id, "Converting PDF pages to images...", stage="pdf_to_images")

    # Convert PDF to images
    images = convert_from_path(str(pdf_path), dpi=150)

    if run_id:
        emit_log(run_id, f"Found {len(images)} pages in PDF", stage="pdf_to_images")

    image_paths = []
    for i, image in enumerate(images, start=1):
        img_path = pages_dir / f"page_{i:03d}.png"
        image.save(str(img_path), "PNG")
        image_paths.append(img_path)
        if run_id and i % 5 == 0:
            emit_log(run_id, f"Converted page {i}/{len(images)}", stage="pdf_to_images")

    if run_id:
        emit_log(run_id, f"Finished converting {len(images)} pages to PNG", level="success", stage="pdf_to_images")

    return image_paths


def extract_embedded_images(run_path: Path, run_id: str = None) -> list[Path]:
    """
    Extract embedded images from PDF using pdfimages (poppler).

    Returns list of extracted image paths.
    """
    pdf_path = run_path / "original.pdf"
    output_dir = run_path / "extracted_images"
    output_prefix = output_dir / "img"

    if run_id:
        emit_log(run_id, "Extracting embedded images from PDF...", stage="pdfimages")

    # Check if pdfimages is available
    if not shutil.which("pdfimages"):
        if run_id:
            emit_log(run_id, "pdfimages not found, skipping image extraction", level="warn", stage="pdfimages")
        return []

    # Run pdfimages to extract all images as PNG
    try:
        subprocess.run(
            ["pdfimages", "-png", str(pdf_path), str(output_prefix)],
            check=True,
            capture_output=True
        )
    except subprocess.CalledProcessError as e:
        if run_id:
            emit_log(run_id, f"pdfimages error: {e.stderr.decode()}", level="error", stage="pdfimages")
        return []

    # Collect extracted images
    extracted = sorted(output_dir.glob("img-*.png"))

    if run_id:
        emit_log(run_id, f"Extracted {len(extracted)} embedded images", level="success", stage="pdfimages")

    return extracted


async def run_llamaparse(pdf_bytes: bytes, run_id: str = None) -> str:
    """
    Run LlamaParse on PDF to extract markdown.

    Returns markdown string.
    """
    api_key = os.getenv("LLAMA_CLOUD_API_KEY")
    if not api_key:
        if run_id:
            emit_log(run_id, "LLAMA_CLOUD_API_KEY not set", level="error", stage="llamaparse")
        raise ValueError("LLAMA_CLOUD_API_KEY not set")

    if run_id:
        emit_log(run_id, "Starting LlamaParse document processing...", stage="llamaparse")

    # LlamaParse API endpoint
    upload_url = "https://api.cloud.llamaindex.ai/api/parsing/upload"

    async with httpx.AsyncClient(timeout=120.0) as client:
        # Upload the PDF
        files = {"file": ("document.pdf", pdf_bytes, "application/pdf")}
        headers = {"Authorization": f"Bearer {api_key}"}

        if run_id:
            emit_log(run_id, "Uploading PDF to LlamaParse API...", stage="llamaparse")

        upload_response = await client.post(
            upload_url,
            files=files,
            headers=headers,
            data={"result_type": "markdown"}
        )
        upload_response.raise_for_status()
        job_data = upload_response.json()
        job_id = job_data["id"]

        if run_id:
            emit_log(run_id, f"LlamaParse job created: {job_id}", stage="llamaparse")

        # Poll for completion
        status_url = f"https://api.cloud.llamaindex.ai/api/parsing/job/{job_id}"
        poll_count = 0

        while True:
            status_response = await client.get(status_url, headers=headers)
            status_response.raise_for_status()
            status_data = status_response.json()

            if status_data["status"] == "SUCCESS":
                if run_id:
                    emit_log(run_id, "LlamaParse processing complete", level="success", stage="llamaparse")
                break
            elif status_data["status"] == "ERROR":
                error_msg = f"LlamaParse failed: {status_data.get('error', 'Unknown error')}"
                if run_id:
                    emit_log(run_id, error_msg, level="error", stage="llamaparse")
                raise Exception(error_msg)

            poll_count += 1
            if run_id and poll_count % 3 == 0:
                emit_log(run_id, f"LlamaParse processing... (status: {status_data['status']})", stage="llamaparse")

            # Wait before polling again
            import asyncio
            await asyncio.sleep(1)

        # Get the result
        if run_id:
            emit_log(run_id, "Downloading parsed markdown...", stage="llamaparse")

        result_url = f"https://api.cloud.llamaindex.ai/api/parsing/job/{job_id}/result/markdown"
        result_response = await client.get(result_url, headers=headers)
        result_response.raise_for_status()

        markdown = result_response.json()["markdown"]
        if run_id:
            emit_log(run_id, f"Extracted {len(markdown)} characters of markdown", level="success", stage="llamaparse")

        return markdown


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

    emit_log(run_id, f"Starting PDF processing for: {filename}", stage="init")
    emit_log(run_id, f"Run ID: {run_id}", stage="init")

    try:
        # Save original PDF
        emit_log(run_id, "Saving original PDF...", stage="save")
        save_pdf(run_path, pdf_bytes)
        emit_log(run_id, f"PDF saved ({len(pdf_bytes) / 1024:.1f} KB)", level="success", stage="save")

        # Convert to images
        page_images = convert_pdf_to_images(run_path, run_id)

        # Extract embedded images
        extracted_images = extract_embedded_images(run_path, run_id)

        # Run LlamaParse
        markdown = await run_llamaparse(pdf_bytes, run_id)
        content_path = run_path / "content.md"
        content_path.write_text(markdown)
        emit_log(run_id, "Markdown content saved to disk", stage="save")

        # Save metadata
        metadata = save_metadata(
            run_path,
            filename,
            page_count=len(page_images),
            extracted_image_count=len(extracted_images)
        )

        emit_log(run_id, "Processing complete!", level="success", stage="complete")
        emit_log(run_id, f"Summary: {len(page_images)} pages, {len(extracted_images)} images, {len(markdown)} chars", stage="complete")

        return {
            "run_id": run_id,
            "run_path": str(run_path),
            "metadata": metadata,
            "markdown_preview": markdown[:500] + "..." if len(markdown) > 500 else markdown
        }

    except Exception as e:
        emit_log(run_id, f"Processing failed: {str(e)}", level="error", stage="error")
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
