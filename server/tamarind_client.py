"""Tamarind Bio API client for submitting jobs, polling status, and downloading results."""

import logging
import os
import time
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

BASE_URL = "https://app.tamarind.bio/api/"


class TamarindClient:
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.environ.get("TAMARIND_API_KEY", "")
        if not self.api_key:
            raise ValueError("TAMARIND_API_KEY is required")
        self.headers = {"x-api-key": self.api_key}

    def submit_job(self, job_name: str, tool_type: str, settings: dict, project_tag: str | None = None) -> str:
        """Submit a single job. Returns the response text."""
        params = {
            "jobName": job_name,
            "type": tool_type,
            "settings": settings,
        }
        if project_tag:
            params["projectTag"] = project_tag

        resp = requests.post(BASE_URL + "submit-job", headers=self.headers, json=params, timeout=30)
        resp.raise_for_status()
        logger.info(f"Submitted job '{job_name}' (type={tool_type}): {resp.text}")
        return resp.text

    def upload_file(self, filename: str, content: bytes) -> str:
        """Upload a file to Tamarind. Returns the response text."""
        resp = requests.put(
            BASE_URL + f"upload/{filename}",
            headers={**self.headers, "Content-Type": "application/octet-stream"},
            data=content,
            timeout=60,
        )
        resp.raise_for_status()
        logger.info(f"Uploaded file '{filename}': {resp.text}")
        return resp.text

    def get_jobs(self) -> dict:
        """List all jobs and their statuses."""
        resp = requests.get(BASE_URL + "jobs", headers=self.headers, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def get_job_status(self, job_name: str) -> str | None:
        """Get the status of a specific job. Returns status string or None if not found."""
        data = self.get_jobs()
        for job in data.get("jobs", []):
            if job.get("jobName") == job_name or job.get("name") == job_name:
                return job.get("status", "unknown")
        return None

    def get_result(self, job_name: str) -> dict:
        """Download results for a completed job."""
        resp = requests.post(
            BASE_URL + "result",
            headers=self.headers,
            json={"jobName": job_name},
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json()

    def download_result_files(self, job_name: str, output_dir: Path) -> list[Path]:
        """Download result files for a job into output_dir. Returns list of saved file paths."""
        output_dir.mkdir(parents=True, exist_ok=True)
        resp = requests.post(
            BASE_URL + "result",
            headers=self.headers,
            json={"jobName": job_name},
            timeout=120,
        )
        resp.raise_for_status()

        content_type = resp.headers.get("Content-Type", "")
        saved = []

        if "application/json" in content_type:
            import json
            result_path = output_dir / f"{job_name}_result.json"
            result_path.write_text(json.dumps(resp.json(), indent=2))
            saved.append(result_path)
        else:
            # Binary file (zip, pdb, etc.)
            ext = ".zip" if "zip" in content_type else ".dat"
            result_path = output_dir / f"{job_name}{ext}"
            result_path.write_bytes(resp.content)
            saved.append(result_path)

        logger.info(f"Downloaded results for '{job_name}': {[str(p) for p in saved]}")
        return saved

    def poll_until_complete(
        self,
        job_name: str,
        poll_interval: float = 15.0,
        max_wait: float = 3600.0,
    ) -> str:
        """Poll job status until complete or timeout. Returns final status."""
        start = time.time()
        while time.time() - start < max_wait:
            status = self.get_job_status(job_name)
            if status is None:
                logger.warning(f"Job '{job_name}' not found in jobs list")
                time.sleep(poll_interval)
                continue

            logger.info(f"Job '{job_name}' status: {status}")
            if status == "Complete":
                return status
            if status == "Stopped":
                raise RuntimeError(f"Job '{job_name}' was stopped/failed")

            time.sleep(poll_interval)

        raise TimeoutError(f"Job '{job_name}' did not complete within {max_wait}s")

    def submit_and_wait(
        self,
        job_name: str,
        tool_type: str,
        settings: dict,
        poll_interval: float = 15.0,
        max_wait: float = 3600.0,
    ) -> str:
        """Submit a job and wait for completion. Returns final status."""
        self.submit_job(job_name, tool_type, settings)
        return self.poll_until_complete(job_name, poll_interval, max_wait)

    def delete_job(self, job_name: str) -> str:
        """Delete a job and its data."""
        resp = requests.delete(
            BASE_URL + "delete-job",
            headers=self.headers,
            json={"jobName": job_name},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.text

    def list_tools(self) -> list[dict]:
        """Get all available tools and their settings schemas."""
        resp = requests.get(BASE_URL + "tools", headers=self.headers, timeout=30)
        resp.raise_for_status()
        return resp.json()
