#!/usr/bin/env python3
"""
claudex-compete — Competitive UI generation: Claude vs Codex with iterative evaluation.

Both agents build UI from the same prompt. An evaluator scores each round,
provides feedback, and both agents iterate to produce the best possible result.
"""

import argparse
import fcntl
import itertools
import json
import os
import pty
import re
import select
import shlex
import shutil
import struct
import subprocess
import sys
import tempfile
import termios
import textwrap
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

from prompt_toolkit import PromptSession
from prompt_toolkit.completion import Completer, Completion
from prompt_toolkit.formatted_text import HTML
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.keys import Keys
from prompt_toolkit.styles import Style as PTStyle

# ── ANSI Colors ──────────────────────────────────────────────────────────────

RESET   = "\033[0m"
BOLD    = "\033[1m"
DIM     = "\033[2m"
CYAN    = "\033[36m"
GREEN   = "\033[32m"
RED     = "\033[31m"
YELLOW  = "\033[33m"
MAGENTA = "\033[35m"
WHITE   = "\033[97m"
BLUE    = "\033[34m"

LOG_DIR = ".claudex-compete"


# ── Spinner ──────────────────────────────────────────────────────────────────

class Spinner:
    FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

    def __init__(self, message: str, color: str = CYAN):
        self.message = message
        self.color = color
        self._stop = threading.Event()
        self._thread = None

    def _spin(self):
        for frame in itertools.cycle(self.FRAMES):
            if self._stop.is_set():
                break
            sys.stdout.write(f"\r  {self.color}{frame}{RESET} {self.message}")
            sys.stdout.flush()
            time.sleep(0.08)

    def start(self):
        self._thread = threading.Thread(target=self._spin, daemon=True)
        self._thread.start()

    def stop(self, success: bool = True):
        self._stop.set()
        if self._thread:
            self._thread.join()
        icon = f"{GREEN}✔{RESET}" if success else f"{RED}✘{RESET}"
        sys.stdout.write(f"\r  {icon} {self.message}\n")
        sys.stdout.flush()


# ── Data ─────────────────────────────────────────────────────────────────────

@dataclass
class RoundResult:
    round_num: int
    claude_score: float
    codex_score: float
    winner: str  # "claude", "codex", or "tie"
    feedback_claude: str
    feedback_codex: str
    reason: str


@dataclass
class CompeteConfig:
    workspace: Path
    rounds: int
    eval_model: str
    claude_model: str | None
    codex_model: str | None
    verbose: bool
    page_ext: str


# ── File Completer (from claudex) ────────────────────────────────────────────

class FileCompleter(Completer):
    IGNORE = {
        ".git", "node_modules", "__pycache__", ".venv", "venv",
        ".tox", ".mypy_cache", ".pytest_cache", ".claudex-compete",
        ".DS_Store", ".egg-info",
    }

    def __init__(self, root: str | None = None):
        self.root = root or os.getcwd()
        self._cache: list[str] | None = None

    def _scan(self) -> list[str]:
        if self._cache is not None:
            return self._cache
        paths: list[str] = []
        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = sorted(
                d for d in dirnames
                if d not in self.IGNORE and not d.startswith(".")
            )
            rel = os.path.relpath(dirpath, self.root)
            if rel != ".":
                paths.append(rel + "/")
            for fname in sorted(filenames):
                if fname.startswith("."):
                    continue
                p = os.path.join(rel, fname) if rel != "." else fname
                paths.append(p)
            if len(paths) > 5000:
                break
        self._cache = paths
        return paths

    def get_completions(self, document, complete_event):
        text = document.text_before_cursor
        at_pos = text.rfind("@")
        if at_pos == -1:
            return
        if at_pos > 0 and text[at_pos - 1].isalnum():
            return
        partial = text[at_pos + 1:]
        if " " in partial:
            return
        partial_lower = partial.lower()
        for path in self._scan():
            if not partial or partial_lower in path.lower():
                is_dir = path.endswith("/")
                yield Completion(
                    path,
                    start_position=-len(partial),
                    display_meta="folder" if is_dir else "",
                )


# ── Prompt GUI ───────────────────────────────────────────────────────────────

def banner():
    ORANGE = "\033[38;5;208m"
    FIRE   = "\033[38;5;196m"
    EMBER  = "\033[38;5;202m"
    title = f"""{BOLD}
    {FIRE} ██████╗ ██████╗ ███╗   ███╗██████╗ ███████╗████████╗███████╗{RESET}
    {EMBER}██╔════╝██╔═══██╗████╗ ████║██╔══██╗██╔════╝╚══██╔══╝██╔════╝{RESET}
    {ORANGE}██║     ██║   ██║██╔████╔██║██████╔╝█████╗     ██║   █████╗  {RESET}
    {EMBER}██║     ██║   ██║██║╚██╔╝██║██╔═══╝ ██╔══╝     ██║   ██╔══╝  {RESET}
    {FIRE}╚██████╗╚██████╔╝██║ ╚═╝ ██║██║     ███████╗   ██║   ███████╗{RESET}
    {RED} ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚══════╝   ╚═╝   ╚══════╝{RESET}"""
    print(title)
    print()
    print(f"  {BOLD}{RED}CLAUDE{RESET} {BOLD}{ORANGE}vs{RESET} {BOLD}{FIRE}CODEX{RESET}  {DIM}— fight for the best UI{RESET}")
    print()
    print(f"  {DIM}Instructions:{RESET}")
    print(f"  {DIM}  • Describe the UI you want built in plain English{RESET}")
    print(f"  {DIM}  • Type {RESET}{CYAN}@{RESET}{DIM} to reference files, or {RESET}{WHITE}drag images{RESET}{DIM} into the prompt{RESET}")
    print(f"  {DIM}  • Press {RESET}{WHITE}Enter{RESET}{DIM} to submit, {RESET}{WHITE}Option+Enter{RESET}{DIM} for newline{RESET}")
    print(f"  {DIM}  • Both agents build your UI in parallel and an evaluator judges{RESET}")
    print(f"  {DIM}  • Multiple rounds of feedback drive both to {RESET}{BOLD}{ORANGE}compete harder{RESET}")
    print(f"  {DIM}  • Press {RESET}{WHITE}Ctrl+C{RESET}{DIM} to exit{RESET}")
    print()


def make_prompt_session(placeholder_text: str) -> PromptSession:
    bindings = KeyBindings()

    @bindings.add(Keys.Enter)
    def _submit(event):
        buf = event.current_buffer
        if buf.complete_state:
            buf.complete_state = None
            return
        if buf.text.strip():
            buf.validate_and_handle()
        else:
            buf.insert_text("\n")

    @bindings.add(Keys.Escape, Keys.Enter)
    def _newline(event):
        event.current_buffer.insert_text("\n")

    @bindings.add(Keys.Up)
    def _up(event):
        buf = event.current_buffer
        if buf.complete_state:
            buf.complete_previous()
        else:
            buf.auto_up()

    @bindings.add(Keys.Down)
    def _down(event):
        buf = event.current_buffer
        if buf.complete_state:
            buf.complete_next()
        else:
            buf.auto_down()

    style = PTStyle.from_dict({
        "prompt": "bold fg:ansicyan",
        "placeholder": "fg:ansibrightblack italic",
        "completion-menu": "bg:ansiblack fg:ansiwhite",
        "completion-menu.completion.current": "bg:ansicyan fg:ansiblack",
        "completion-menu.meta.completion": "fg:ansibrightblack",
        "completion-menu.meta.completion.current": "fg:ansiblack",
    })

    return PromptSession(
        message=[("class:prompt", "  ❯ ")],
        placeholder=HTML(
            f'<style fg="ansibrightblack">{placeholder_text}</style>'
        ),
        multiline=True,
        key_bindings=bindings,
        completer=FileCompleter(),
        complete_while_typing=True,
        style=style,
        prompt_continuation="    ",
    )


def interactive_prompt() -> str:
    session = make_prompt_session(
        "Describe the UI to build... (type @ to reference files)"
    )
    try:
        text = session.prompt().strip()
        return text
    except (EOFError, KeyboardInterrupt):
        print()
        sys.exit(0)


IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"}


def normalize_dragged_paths(prompt: str) -> tuple[str, list[str]]:
    """Detect absolute file paths pasted/dragged into the prompt (macOS behavior).

    On macOS, dragging a file into Terminal pastes its absolute path, sometimes
    with escaping (backslash-spaces) or quotes. This detects those and converts
    them to relative @references or adds them as image refs.

    Returns (cleaned_prompt, list_of_image_paths).
    """
    dragged_images: list[str] = []
    cwd = os.getcwd()

    # Match absolute paths: /path/to/file.ext (with optional backslash-escaped spaces)
    # Also match quoted paths: '/path/to/file.ext' or "/path/to/file.ext"
    abs_path_re = re.compile(
        r"""(?:['"])(\/[^\n'"]+?)(?:['"])"""   # quoted absolute path
        r"""|"""
        r"""(\/(?:[^\s\\]|\\ )+)""",            # unquoted with possible backslash-spaces
        re.VERBOSE,
    )

    def _replace(match):
        raw = match.group(1) or match.group(2)
        # Unescape backslash-spaces from drag-drop
        cleaned = raw.replace("\\ ", " ")

        if not os.path.exists(cleaned):
            return match.group(0)

        ext = os.path.splitext(cleaned)[1].lower()

        # Try to make relative to cwd
        try:
            rel = os.path.relpath(cleaned, cwd)
        except ValueError:
            rel = cleaned

        # Don't convert paths outside the project (too many ../)
        if rel.startswith("../../"):
            # It's outside the project — keep as absolute for images, skip for code
            if ext in IMAGE_EXTS:
                dragged_images.append(cleaned)
                return f"[image: {os.path.basename(cleaned)}]"
            return match.group(0)

        if ext in IMAGE_EXTS:
            dragged_images.append(rel)
            return f"[image: {os.path.basename(cleaned)}]"
        else:
            return f"@{rel}"

    cleaned_prompt = abs_path_re.sub(_replace, prompt)
    return cleaned_prompt, dragged_images


def extract_file_references(prompt: str) -> list[str]:
    """Extract @file references from the prompt, returning relative paths."""
    refs = re.findall(r"(?<!\w)@([\w./\-]+)", prompt)
    seen: list[str] = []
    for ref in refs:
        if ref not in seen:
            path = os.path.join(os.getcwd(), ref)
            if os.path.isfile(path) or os.path.isdir(path):
                seen.append(ref)
    return seen


def resolve_file_references(prompt: str) -> str:
    refs = extract_file_references(prompt)
    if not refs:
        return prompt

    parts: list[str] = []
    for ref in refs:
        path = os.path.join(os.getcwd(), ref)
        if os.path.isfile(path):
            try:
                with open(path) as f:
                    content = f.read()
                parts.append(f"--- {ref} ---\n{content}")
            except Exception:
                pass
        elif os.path.isdir(path):
            try:
                entries = sorted(os.listdir(path))
                parts.append(f"--- {ref}/ ---\n" + "\n".join(entries))
            except Exception:
                pass

    if parts:
        return prompt + "\n\nReferenced files:\n\n" + "\n\n".join(parts)
    return prompt


# ── Command Execution ────────────────────────────────────────────────────────

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")


def run_cmd_capture(cmd: list[str], cwd: str, log_file: str, label: str,
                    timeout: int = 600) -> tuple[bool, str]:
    """Run a command with a spinner, capture output."""
    spinner = Spinner(label)
    spinner.start()
    try:
        result = subprocess.run(
            cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout,
        )
        combined = result.stdout + "\n" + result.stderr
        with open(log_file, "w") as f:
            f.write(combined + f"\n\nExit code: {result.returncode}")
        ok = result.returncode == 0
        spinner.stop(success=ok)
        return ok, combined
    except subprocess.TimeoutExpired:
        spinner.stop(success=False)
        msg = f"Command timed out after {timeout}s"
        with open(log_file, "w") as f:
            f.write(msg)
        return False, msg
    except FileNotFoundError:
        spinner.stop(success=False)
        msg = f"Command not found: {cmd[0]}"
        with open(log_file, "w") as f:
            f.write(msg)
        return False, msg


def run_cmd_interactive(cmd: list[str], cwd: str, log_file: str,
                        label: str) -> tuple[bool, str]:
    """Run with PTY for interactive permission prompts."""
    master_fd, slave_fd = pty.openpty()

    try:
        if sys.stdout.isatty():
            sz = os.get_terminal_size()
            winsize = struct.pack("HHHH", sz.lines, sz.columns, 0, 0)
            fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)
    except Exception:
        pass

    try:
        proc = subprocess.Popen(
            cmd, cwd=cwd,
            stdin=slave_fd, stdout=slave_fd, stderr=slave_fd,
            close_fds=True,
        )
    except FileNotFoundError:
        os.close(slave_fd)
        os.close(master_fd)
        msg = f"Command not found: {cmd[0]}"
        print(f"  {RED}✘{RESET} {msg}")
        return False, msg

    os.close(slave_fd)
    raw_chunks: list[str] = []
    line_buf = ""
    idle_ticks = 0
    stdin_fd = sys.stdin.fileno() if sys.stdin.isatty() else None

    try:
        while True:
            fds = [master_fd]
            if stdin_fd is not None:
                fds.append(stdin_fd)
            rlist = select.select(fds, [], [], 0.25)[0]

            if not rlist:
                idle_ticks += 1
                if idle_ticks >= 4 and line_buf.strip():
                    sys.stdout.write(f"    {line_buf.rstrip()}\n")
                    sys.stdout.flush()
                    line_buf = ""
                    idle_ticks = 0
                if proc.poll() is not None:
                    break
                continue

            idle_ticks = 0
            for fd in rlist:
                if fd == master_fd:
                    try:
                        data = os.read(master_fd, 8192)
                    except OSError:
                        data = b""
                    if not data:
                        proc.wait()
                        break
                    text = data.decode("utf-8", errors="replace")
                    raw_chunks.append(text)
                    line_buf += text
                    while "\n" in line_buf:
                        line, line_buf = line_buf.split("\n", 1)
                        clean = _ANSI_RE.sub("", line).rstrip()
                        if clean:
                            sys.stdout.write(f"    {DIM}{clean}{RESET}\n")
                            sys.stdout.flush()
                elif fd == stdin_fd:
                    try:
                        user_data = os.read(stdin_fd, 4096)
                        if user_data:
                            os.write(master_fd, user_data)
                    except OSError:
                        pass
            else:
                continue
            break
    finally:
        os.close(master_fd)
        proc.wait()

    full_log = "".join(raw_chunks)
    with open(log_file, "w") as f:
        f.write(full_log + f"\n\nExit code: {proc.returncode}")

    ok = proc.returncode == 0
    icon = f"{GREEN}✔{RESET}" if ok else f"{RED}✘{RESET}"
    print(f"  {icon} {label}")
    return ok, full_log


# ── Agent Runners ────────────────────────────────────────────────────────────

def run_claude(workspace: str, prompt: str, log_file: str,
               model: str | None = None, verbose: bool = False,
               image_paths: list[str] | None = None) -> tuple[bool, str]:
    """Run Claude CLI on the workspace — must actually write files, not just print."""
    cmd = ["claude", "-p", "--dangerously-skip-permissions"]
    if model:
        cmd.extend(["--model", model])
    # Attach images as context for Claude
    if image_paths:
        for img in image_paths:
            abs_img = os.path.join(workspace, img)
            if os.path.isfile(abs_img):
                cmd.extend(["--file", abs_img])
    cmd.append(prompt)

    label = f"{BLUE}Claude{RESET} generating..."
    if verbose:
        return run_cmd_interactive(cmd, workspace, log_file, label)
    return run_cmd_capture(cmd, workspace, log_file, label)


def run_codex(workspace: str, prompt: str, log_file: str,
              model: str | None = None, verbose: bool = False,
              image_paths: list[str] | None = None) -> tuple[bool, str]:
    """Run Codex CLI on the workspace."""
    cmd = [
        "codex", "exec",
        "--full-auto",
        "--sandbox", "workspace-write",
    ]
    if model:
        cmd.extend(["--model", model])
    # Attach images as context for Codex
    if image_paths:
        for img in image_paths:
            abs_img = os.path.join(workspace, img)
            if os.path.isfile(abs_img):
                cmd.extend(["--image", abs_img])
    cmd.append(prompt)

    label = f"{MAGENTA}Codex{RESET} generating..."
    if verbose:
        return run_cmd_interactive(cmd, workspace, log_file, label)
    return run_cmd_capture(cmd, workspace, log_file, label)


# ── Evaluator ────────────────────────────────────────────────────────────────

def build_eval_prompt(user_prompt: str, claude_output: str, codex_output: str,
                      round_num: int, total_rounds: int,
                      history: list[RoundResult]) -> tuple[str, bool]:
    """Build a blind evaluation prompt. Returns (prompt, a_is_claude).

    Randomly assigns outputs to "Version A" and "Version B" to prevent
    evaluator bias toward either agent.
    """
    import random
    a_is_claude = random.choice([True, False])

    if a_is_claude:
        version_a, version_b = claude_output, codex_output
    else:
        version_a, version_b = codex_output, claude_output

    history_text = ""
    if history:
        history_text = "\n\nPrevious round scores:\n"
        for r in history:
            history_text += (
                f"  Round {r.round_num}: A={r.claude_score if a_is_claude else r.codex_score}, "
                f"B={r.codex_score if a_is_claude else r.claude_score}\n"
            )

    prompt = textwrap.dedent(f"""
        You are an expert UI/UX evaluator judging a BLIND competition between
        two anonymous AI agents. You do NOT know which agent produced which version.
        Both were given the same prompt to build a UI component/page.

        This is round {round_num} of {total_rounds}.
        {history_text}

        ORIGINAL USER PROMPT:
        {user_prompt}

        === VERSION A ===
        {_truncate(version_a, 25000)}

        === VERSION B ===
        {_truncate(version_b, 25000)}

        EVALUATION CRITERIA (score each 0-100):
        1. Requirement fit — how well does it match what the user asked for?
        2. Code quality — clean, idiomatic, follows project conventions
        3. UX/UI design — visual hierarchy, clarity, responsiveness
        4. Completeness — is it a working, complete implementation with real code?
        5. Codebase style match — does it fit the existing project patterns?

        IMPORTANT: An agent that only describes changes in prose but does NOT
        produce actual code should score very low on completeness.

        You MUST respond with ONLY valid JSON matching this exact schema:
        {{
            "winner": "A" | "B" | "tie",
            "score_a": <number 0-100>,
            "score_b": <number 0-100>,
            "reason": "<1-2 sentence explanation>",
            "feedback_a": "<specific actionable feedback for Version A to improve>",
            "feedback_b": "<specific actionable feedback for Version B to improve>"
        }}

        Be fair and specific. Score based on the actual code quality, not assumptions.
    """).strip()

    return prompt, a_is_claude


def _truncate(text: str, max_chars: int = 25000) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n\n[TRUNCATED]"


def run_evaluator(config: CompeteConfig, user_prompt: str,
                  claude_output: str, codex_output: str,
                  round_num: int, history: list[RoundResult]) -> RoundResult | None:
    """Run the evaluator model to score both outputs."""
    logs_dir = config.workspace / LOG_DIR
    logs_dir.mkdir(parents=True, exist_ok=True)

    eval_prompt, a_is_claude = build_eval_prompt(
        user_prompt, claude_output, codex_output,
        round_num, config.rounds, history,
    )

    # Use claude CLI as the evaluator — blind to which agent is which
    cmd = ["claude", "-p", "--model", config.eval_model, eval_prompt]
    log_file = str(logs_dir / f"round{round_num:02d}_eval.log")

    spinner = Spinner(f"Evaluator scoring round {round_num}...", color=YELLOW)
    spinner.start()

    try:
        result = subprocess.run(
            cmd, cwd=str(config.workspace),
            capture_output=True, text=True, timeout=120,
        )
        raw = result.stdout + "\n" + result.stderr
        with open(log_file, "w") as f:
            f.write(raw)

        if result.returncode != 0:
            spinner.stop(success=False)
            print(f"  {RED}Evaluator failed (exit {result.returncode}){RESET}")
            return None

        spinner.stop(success=True)
    except subprocess.TimeoutExpired:
        spinner.stop(success=False)
        print(f"  {RED}Evaluator timed out{RESET}")
        return None
    except FileNotFoundError:
        spinner.stop(success=False)
        print(f"  {RED}claude CLI not found{RESET}")
        return None

    # Parse JSON from response
    stdout = result.stdout.strip()
    try:
        payload = _parse_eval_json(stdout)
    except (json.JSONDecodeError, ValueError) as e:
        print(f"  {RED}Could not parse eval response: {e}{RESET}")
        print(f"  {DIM}Raw output saved to {log_file}{RESET}")
        return None

    # Map blind A/B results back to claude/codex
    raw_winner = str(payload.get("winner", "tie")).upper().strip()
    score_a = float(payload.get("score_a", 0))
    score_b = float(payload.get("score_b", 0))
    feedback_a = str(payload.get("feedback_a", ""))
    feedback_b = str(payload.get("feedback_b", ""))

    if a_is_claude:
        claude_score, codex_score = score_a, score_b
        feedback_claude, feedback_codex = feedback_a, feedback_b
    else:
        claude_score, codex_score = score_b, score_a
        feedback_claude, feedback_codex = feedback_b, feedback_a

    if raw_winner == "A":
        winner = "claude" if a_is_claude else "codex"
    elif raw_winner == "B":
        winner = "codex" if a_is_claude else "claude"
    else:
        winner = "tie"

    return RoundResult(
        round_num=round_num,
        claude_score=claude_score,
        codex_score=codex_score,
        winner=winner,
        feedback_claude=feedback_claude,
        feedback_codex=feedback_codex,
        reason=str(payload.get("reason", "")),
    )


def _parse_eval_json(raw: str) -> dict:
    raw = raw.strip()
    if not raw:
        raise ValueError("Empty eval response")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))


# ── Competition Pipeline ─────────────────────────────────────────────────────

def build_generation_prompt(user_prompt: str, agent_name: str,
                            round_num: int, total_rounds: int,
                            target_files: list[str] | None = None,
                            feedback: str | None = None) -> str:
    # Build target files instruction
    target_instruction = ""
    if target_files:
        file_list = "\n".join(f"        - {f}" for f in target_files)
        target_instruction = textwrap.dedent(f"""

        TARGET FILES — you MUST edit or create these specific files:
{file_list}
        Read the existing content of these files first, then modify them in place.
        Do NOT create new files unless the prompt asks you to. Focus your changes
        on the target files listed above.
        """)
    else:
        target_instruction = """

        Create or edit files as needed to fulfill the request. Look at the project
        structure to determine the right file locations and naming conventions.
        """

    base = textwrap.dedent(f"""
        You are competing against another AI agent to build the best UI.
        This is round {round_num} of {total_rounds} in a head-to-head competition.

        USER REQUEST:
        {user_prompt}
        {target_instruction}
        RULES:
        - You MUST write actual code files using your tools. Do NOT just describe
          changes in prose. The evaluator will reject text-only responses.
        - Follow the project's existing framework, code style, and conventions.
        - Prioritize UX clarity, accessibility, and responsive design.
        - Produce complete, working code — not pseudocode or placeholders.
        - Match the codebase style of the existing project.
        - Make reasonable assumptions; do not ask questions.
        - You are {agent_name}. Build the best possible UI.
    """).strip()

    if feedback and round_num > 1:
        base += textwrap.dedent(f"""

        EVALUATOR FEEDBACK FROM PREVIOUS ROUND:
        {feedback}

        Use this feedback to improve your implementation this round.
        Fix the issues mentioned and make your UI better than before.
        """)

    return base


def run_competition(config: CompeteConfig, user_prompt: str,
                    target_files: list[str] | None = None,
                    image_refs: list[str] | None = None):
    """Run the full multi-round competition."""
    logs_dir = config.workspace / LOG_DIR
    logs_dir.mkdir(parents=True, exist_ok=True)

    # Create isolated workspaces for each agent
    claude_ws = logs_dir / "workspace_claude"
    codex_ws = logs_dir / "workspace_codex"

    # Copy the project into both workspaces
    for ws in (claude_ws, codex_ws):
        if ws.exists():
            shutil.rmtree(ws)
        shutil.copytree(
            config.workspace, ws,
            ignore=shutil.ignore_patterns(
                ".git", "node_modules", "__pycache__", ".venv",
                ".claudex-compete", ".ui-page-battle",
            ),
        )

    # Copy referenced images into both workspaces
    if image_refs:
        for img in image_refs:
            src = config.workspace / img
            if src.exists():
                for ws in (claude_ws, codex_ws):
                    dst = ws / img
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, dst)

    history: list[RoundResult] = []
    claude_feedback: str | None = None
    codex_feedback: str | None = None

    for round_num in range(1, config.rounds + 1):
        print()
        print(f"  {BOLD}{CYAN}{'━' * 50}{RESET}")
        print(f"  {BOLD}{CYAN}  ROUND {round_num} of {config.rounds}{RESET}")
        print(f"  {BOLD}{CYAN}{'━' * 50}{RESET}")

        # Build prompts with feedback
        claude_prompt = build_generation_prompt(
            user_prompt, "Claude", round_num, config.rounds,
            target_files=target_files, feedback=claude_feedback,
        )
        codex_prompt = build_generation_prompt(
            user_prompt, "Codex", round_num, config.rounds,
            target_files=target_files, feedback=codex_feedback,
        )

        # Run both agents in parallel
        print()
        print(f"  {DIM}Running both agents in parallel...{RESET}")

        claude_result: dict = {}
        codex_result: dict = {}

        def _run_claude():
            ok, output = run_claude(
                str(claude_ws), claude_prompt,
                str(logs_dir / f"round{round_num:02d}_claude.log"),
                model=config.claude_model,
                verbose=config.verbose,
                image_paths=image_refs,
            )
            claude_result["ok"] = ok
            claude_result["output"] = output

        def _run_codex():
            ok, output = run_codex(
                str(codex_ws), codex_prompt,
                str(logs_dir / f"round{round_num:02d}_codex.log"),
                model=config.codex_model,
                verbose=config.verbose,
                image_paths=image_refs,
            )
            codex_result["ok"] = ok
            codex_result["output"] = output

        threads = [
            threading.Thread(target=_run_claude),
            threading.Thread(target=_run_codex),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        claude_ok = claude_result.get("ok", False)
        codex_ok = codex_result.get("ok", False)
        claude_output = claude_result.get("output", "")
        codex_output = codex_result.get("output", "")

        if not claude_ok and not codex_ok:
            print(f"\n  {RED}Both agents failed this round.{RESET}")
            continue

        # Evaluate
        print()
        result = run_evaluator(
            config, user_prompt, claude_output, codex_output,
            round_num, history,
        )

        if result:
            history.append(result)
            claude_feedback = result.feedback_claude
            codex_feedback = result.feedback_codex
            print_round_result(result)
        else:
            print(f"  {YELLOW}Evaluation failed for round {round_num}{RESET}")
            claude_feedback = None
            codex_feedback = None

    # Final summary
    print_final_summary(config, history, claude_ws, codex_ws)


def print_round_result(result: RoundResult):
    """Print a single round's result."""
    winner_color = BLUE if result.winner == "claude" else MAGENTA if result.winner == "codex" else YELLOW

    print()
    print(f"  {BOLD}Round {result.round_num} Results:{RESET}")
    print(f"    {BLUE}Claude:{RESET}  {result.claude_score}/100")
    print(f"    {MAGENTA}Codex:{RESET}   {result.codex_score}/100")
    print(f"    {BOLD}Winner:{RESET}  {winner_color}{result.winner.upper()}{RESET}")
    print(f"    {DIM}Reason: {result.reason}{RESET}")

    if result.feedback_claude:
        print(f"    {BLUE}Feedback for Claude:{RESET} {DIM}{result.feedback_claude}{RESET}")
    if result.feedback_codex:
        print(f"    {MAGENTA}Feedback for Codex:{RESET}  {DIM}{result.feedback_codex}{RESET}")


def print_final_summary(config: CompeteConfig, history: list[RoundResult],
                        claude_ws: Path, codex_ws: Path):
    """Print the final competition summary and apply the winner."""
    print()
    print(f"  {BOLD}{CYAN}{'━' * 50}{RESET}")
    print(f"  {BOLD}{CYAN}  FINAL RESULTS{RESET}")
    print(f"  {BOLD}{CYAN}{'━' * 50}{RESET}")
    print()

    if not history:
        print(f"  {RED}No rounds completed successfully.{RESET}")
        print(f"  {DIM}Check logs in {config.workspace / LOG_DIR}{RESET}")
        return

    # Tally
    claude_wins = sum(1 for r in history if r.winner == "claude")
    codex_wins = sum(1 for r in history if r.winner == "codex")
    ties = sum(1 for r in history if r.winner == "tie")

    claude_avg = sum(r.claude_score for r in history) / len(history)
    codex_avg = sum(r.codex_score for r in history) / len(history)

    # Show round-by-round
    for r in history:
        winner_color = BLUE if r.winner == "claude" else MAGENTA if r.winner == "codex" else YELLOW
        print(f"    Round {r.round_num}: {BLUE}Claude {r.claude_score}{RESET} vs "
              f"{MAGENTA}Codex {r.codex_score}{RESET}  "
              f"-> {winner_color}{r.winner.upper()}{RESET}")

    print()
    print(f"  {BOLD}Score:{RESET}")
    print(f"    {BLUE}Claude:{RESET}  {claude_wins} wins, avg {claude_avg:.1f}/100")
    print(f"    {MAGENTA}Codex:{RESET}   {codex_wins} wins, avg {codex_avg:.1f}/100")
    if ties:
        print(f"    {YELLOW}Ties:{RESET}    {ties}")

    # Determine overall winner
    if claude_avg > codex_avg:
        overall = "claude"
    elif codex_avg > claude_avg:
        overall = "codex"
    elif claude_wins > codex_wins:
        overall = "claude"
    elif codex_wins > claude_wins:
        overall = "codex"
    else:
        # Use last round's winner for tiebreaker
        overall = history[-1].winner if history[-1].winner != "tie" else "claude"

    winner_color = BLUE if overall == "claude" else MAGENTA
    winner_ws = claude_ws if overall == "claude" else codex_ws

    print()
    print(f"  {BOLD}Overall Winner: {winner_color}{overall.upper()}{RESET}")
    print()

    # Apply winner's changes to the real workspace
    print(f"  {DIM}Applying {overall}'s changes to your project...{RESET}")
    changes_applied = apply_winner(config.workspace, winner_ws)

    if changes_applied:
        print(f"  {GREEN}✔{RESET} Winner's changes applied successfully.")
    else:
        print(f"  {YELLOW}No file changes detected from the winner.{RESET}")
        print(f"  {DIM}Winner workspace: {winner_ws}{RESET}")

    print()
    print(f"  {DIM}Logs saved in {config.workspace / LOG_DIR}{RESET}")
    print(f"  {GREEN}✔{RESET} Competition complete!")
    print()


def apply_winner(real_workspace: Path, winner_workspace: Path) -> bool:
    """Copy changed/new files from the winner's workspace to the real project."""
    changes = 0

    for root, dirs, files in os.walk(winner_workspace):
        # Skip hidden dirs and common non-project dirs
        dirs[:] = [
            d for d in dirs
            if not d.startswith(".") and d not in (
                "node_modules", "__pycache__", ".venv",
            )
        ]
        for fname in files:
            if fname.startswith("."):
                continue

            winner_file = Path(root) / fname
            rel = winner_file.relative_to(winner_workspace)
            real_file = real_workspace / rel

            # Check if file is new or modified
            winner_content = winner_file.read_bytes()
            if real_file.exists():
                real_content = real_file.read_bytes()
                if winner_content == real_content:
                    continue

            real_file.parent.mkdir(parents=True, exist_ok=True)
            real_file.write_bytes(winner_content)
            print(f"    {GREEN}+{RESET} {rel}")
            changes += 1

    return changes > 0


# ── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="claudex-compete — Claude vs Codex competitive UI generation",
    )
    parser.add_argument(
        "-r", "--rounds",
        type=int, default=3,
        help="Number of competition rounds (default: 3)",
    )
    parser.add_argument(
        "--eval-model",
        default="claude-sonnet-4-6",
        help="Model used for evaluation (default: claude-sonnet-4-6)",
    )
    parser.add_argument(
        "--claude-model",
        help="Claude model to use for generation",
    )
    parser.add_argument(
        "--codex-model",
        help="Codex model to use for generation",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Show live output from agents (interactive mode)",
    )
    parser.add_argument(
        "--ext",
        default=".tsx",
        help="Default file extension for generated pages (default: .tsx)",
    )
    parser.add_argument(
        "-i", "--image",
        action="append", default=[],
        help="Path to a reference image (screenshot, mockup, wireframe). Can be repeated.",
    )
    parser.add_argument(
        "prompt",
        nargs="*",
        help="UI description (if omitted, interactive prompt is shown)",
    )
    args = parser.parse_args()

    banner()

    # Check CLI tools exist
    for tool in ("claude", "codex"):
        if not shutil.which(tool):
            print(f"  {RED}✘{RESET} `{tool}` CLI not found on PATH.")
            sys.exit(1)

    # Get user prompt
    if args.prompt:
        user_prompt = " ".join(args.prompt)
        print(f"  {BOLD}{WHITE}❯{RESET} {user_prompt}")
    else:
        user_prompt = interactive_prompt()

    if not user_prompt:
        print(f"  {RED}✘{RESET} No description provided.")
        sys.exit(1)

    # Detect dragged-in file paths (macOS pastes absolute paths on drag)
    user_prompt, dragged_images = normalize_dragged_paths(user_prompt)

    # Extract @file references before resolving (these are target files to edit)
    target_files = extract_file_references(user_prompt)

    # Collect image references from all sources
    image_refs = list(args.image)  # from --image flags
    image_refs.extend(dragged_images)  # from drag-and-drop
    prompt_refs = extract_file_references(user_prompt)
    for ref in prompt_refs:
        ext = os.path.splitext(ref)[1].lower()
        if ext in IMAGE_EXTS:
            if ref not in image_refs:
                image_refs.append(ref)
            # Remove images from target files (they're references, not edit targets)
            if ref in target_files:
                target_files.remove(ref)

    if target_files:
        print(f"  {DIM}Target files: {', '.join(target_files)}{RESET}")
    if image_refs:
        print(f"  {DIM}Reference images: {', '.join(image_refs)}{RESET}")

    # Add image context to the prompt text
    if image_refs:
        img_note = "\n\nREFERENCE IMAGES (attached):\n"
        for img in image_refs:
            img_note += f"  - {img}: Use this as visual reference for the UI design.\n"
        user_prompt += img_note

    user_prompt = resolve_file_references(user_prompt)

    config = CompeteConfig(
        workspace=Path.cwd(),
        rounds=args.rounds,
        eval_model=args.eval_model,
        claude_model=args.claude_model,
        codex_model=args.codex_model,
        verbose=args.verbose,
        page_ext=args.ext,
    )

    start_time = time.time()
    run_competition(config, user_prompt,
                    target_files=target_files or None,
                    image_refs=image_refs or None)
    elapsed = time.time() - start_time

    minutes, seconds = divmod(int(elapsed), 60)
    time_str = f"{minutes}m {seconds}s" if minutes else f"{seconds}s"
    print(f"  {DIM}Total time: {time_str}{RESET}")
    print()


if __name__ == "__main__":
    main()
