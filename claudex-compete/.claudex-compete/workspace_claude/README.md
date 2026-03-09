# claudex-compete

**CLAUDE vs CODEX** — competitive UI generation with iterative evaluation.

Both AI agents build UI from the same prompt in parallel. An evaluator scores each round, provides specific feedback, and both agents iterate to produce the best possible result. The winner's code is applied to your project.

## Install

```bash
# Clone
git clone https://github.com/charlie-robison/claudex-compete.git
cd claudex-compete

# Install dependencies
pip install -r requirements.txt

# Add to PATH (pick one)
export PATH="$(pwd):$PATH"              # temporary
ln -sf "$(pwd)/claudex-compete" ~/.local/bin/claudex-compete  # permanent
```

**Requirements:** `claude` CLI and `codex` CLI must be installed and on PATH.

## Usage

```bash
# Interactive prompt (with @ file completion)
claudex-compete

# Inline prompt
claudex-compete "Build a settings page with tabs and form validation"

# Edit a specific file — both agents compete to make the best version
claudex-compete "Redesign @src/pages/Dashboard.tsx with better charts"

# Reference a mockup image (drag into terminal or use --image)
claudex-compete -i mockup.png "Build this dashboard layout"

# 5 rounds with specific models
claudex-compete -r 5 --claude-model claude-opus-4-6 --codex-model o3

# Verbose — see live agent output
claudex-compete -v
```

## How it works

1. You describe the UI you want
2. Both Claude and Codex get isolated copies of your project
3. Each round:
   - Both agents build from the same prompt (+ evaluator feedback)
   - An evaluator scores both on: requirement fit, code quality, UX/UI, completeness, codebase style
   - Specific actionable feedback is given to each agent
4. After all rounds, the overall winner's changes are applied to your project

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `-r, --rounds` | Number of competition rounds | 3 |
| `--eval-model` | Model for evaluation | claude-sonnet-4-6 |
| `--claude-model` | Claude generation model | (default) |
| `--codex-model` | Codex generation model | (default) |
| `-i, --image` | Reference image path (repeatable) | — |
| `-v, --verbose` | Show live agent output | off |
| `--ext` | Default file extension | .tsx |

## License

MIT
