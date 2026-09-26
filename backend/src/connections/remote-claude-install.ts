// Let Anthropic own the native CLI, launcher, and background updates. Claw only
// ensures the CLI is present; authentication remains local to the remote user.
export function remoteClaudeInstallCommand(): string {
  return `set -eu
if [ -x "$HOME/.local/bin/claude" ] && "$HOME/.local/bin/claude" --version >/dev/null 2>&1; then
  "$HOME/.local/bin/claude" --version
  exit 0
fi
if command -v claude >/dev/null 2>&1 && claude --version >/dev/null 2>&1; then
  claude --version
  exit 0
fi
installer=$(mktemp)
trap 'rm -f "$installer"' EXIT
curl --fail --location --silent --show-error --connect-timeout 10 --max-time 60 https://claude.ai/install.sh -o "$installer"
bash "$installer"
"$HOME/.local/bin/claude" --version`;
}

export function remoteClaudeVersionCommand(): string {
  return `set -eu
if [ -x "$HOME/.local/bin/claude" ] && "$HOME/.local/bin/claude" --version >/dev/null 2>&1; then
  "$HOME/.local/bin/claude" --version
elif command -v claude >/dev/null 2>&1 && claude --version >/dev/null 2>&1; then
  claude --version
else
  printf 'Claude Code is not installed.\\n' >&2
  exit 127
fi`;
}
