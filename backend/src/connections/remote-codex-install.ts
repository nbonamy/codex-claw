import { bundledCodexVersion } from '@codex-claw/core/codex-release';

// All paths are Claw-owned; never replace the user's CLI or change shell profiles.
export function remoteCodexInstallCommand(runtimeRoot?: string): string {
  if (!/^\d+\.\d+\.\d+$/u.test(bundledCodexVersion)) throw new Error('Invalid bundled Codex release.');
  return `set -eu
runtime_root=${runtimeRoot ? `'${runtimeRoot.replaceAll("'", "'\\''")}'` : '"$HOME/.codex-claw/codex"'}
runtime_release="$runtime_root/${bundledCodexVersion}"
if [ -x "$runtime_release/bin/codex" ] && [ -x "$runtime_release/bin/codex-code-mode-host" ] && [ "$("$runtime_release/bin/codex" --version)" = "codex-cli ${bundledCodexVersion}" ]; then exit 0; fi
case "$(uname -s)/$(uname -m)" in
  Linux/x86_64) runtime_target=x86_64-unknown-linux-musl ;;
  Darwin/arm64) runtime_target=aarch64-apple-darwin ;;
  *) echo 'Unsupported remote Codex platform.' >&2; exit 1 ;;
esac
mkdir -p "$runtime_root"
runtime_stage=$(mktemp -d "$runtime_root/.install.XXXXXXXX")
trap 'rm -rf "$runtime_stage"' EXIT
runtime_asset="codex-package-$runtime_target.tar.gz"
runtime_url="https://releases.openai.com/codex/releases/${bundledCodexVersion}"
curl --fail --location --silent --show-error --connect-timeout 10 --max-time 300 "$runtime_url/$runtime_asset" -o "$runtime_stage/package.tar.gz"
curl --fail --location --silent --show-error --connect-timeout 10 --max-time 30 "$runtime_url/codex-package_SHA256SUMS" -o "$runtime_stage/SHA256SUMS"
runtime_expected=$(awk -v asset="$runtime_asset" '$2 == asset { print $1 }' "$runtime_stage/SHA256SUMS")
if command -v sha256sum >/dev/null 2>&1; then
  runtime_actual=$(sha256sum "$runtime_stage/package.tar.gz" | cut -d ' ' -f 1)
else
  runtime_actual=$(shasum -a 256 "$runtime_stage/package.tar.gz" | cut -d ' ' -f 1)
fi
[ -n "$runtime_expected" ] && [ "$runtime_actual" = "$runtime_expected" ] || { echo 'Codex archive checksum mismatch.' >&2; exit 1; }
mkdir "$runtime_stage/release"
tar -xzf "$runtime_stage/package.tar.gz" -C "$runtime_stage/release"
test -x "$runtime_stage/release/bin/codex-code-mode-host"
[ "$("$runtime_stage/release/bin/codex" --version)" = "codex-cli ${bundledCodexVersion}" ] || { echo 'Codex version verification failed.' >&2; exit 1; }
if [ -e "$runtime_release" ]; then mv "$runtime_release" "$runtime_stage/previous"; fi
mv "$runtime_stage/release" "$runtime_release"`;
}

export function remoteCodexVersionCommand(connectionVersion?: string): string {
  const managed = connectionVersion && /^\d+\.\d+\.\d+$/u.test(connectionVersion)
    ? `"$HOME/.codex-claw/codex/${connectionVersion}/bin/codex"`
    : '"$HOME/.local/bin/codex"';
  // Newer hosts keep the setting in settings.json; hosts that have not migrated yet still use state.json.
  return `runtime_custom=$(node -e 'const fs = require("fs"); const dir = require("os").homedir() + "/.codex-claw/"; const read = (name) => { try { return JSON.parse(fs.readFileSync(dir + name, "utf8")); } catch { return null; } }; const value = read("settings.json")?.data?.settings?.codexBinaryPath || read("state.json")?.general?.codexBinaryPath; process.stdout.write(typeof value === "string" ? value.trim() : "")')
if [ -n "$runtime_custom" ]; then "$runtime_custom" --version; else ${managed} --version 2>/dev/null || codex --version 2>/dev/null || true; fi`;
}
