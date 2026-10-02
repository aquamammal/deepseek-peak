#!/usr/bin/env bash
#
# Install (or update) the DeepSeek Peak Hours GNOME Shell extension.
#
#   ./install.sh              install and enable, next to the clock
#   ./install.sh --link       symlink instead of copy, for editing in place
#   ./install.sh --zip        also build deepseek-peak@akuma.dev.zip
#   ./install.sh --uninstall  remove the extension and its settings
#
# Re-running it is safe: it replaces the installed copy and re-enables.

set -euo pipefail

UUID="deepseek-peak@akuma.dev"
SCHEMA_ID="org.gnome.shell.extensions.deepseek-peak"
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$HERE/extension"
EXTENSIONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions"
TARGET_DIR="$EXTENSIONS_DIR/$UUID"
ZIP_PATH="$HERE/$UUID.zip"

MODE="copy"
BUILD_ZIP=0
UNINSTALL=0
ASSUME_YES=0

usage() {
    sed -n '3,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit "${1:-0}"
}

while [ $# -gt 0 ]; do
    case "$1" in
        --link)      MODE="link" ;;
        --copy)      MODE="copy" ;;
        --zip)       BUILD_ZIP=1 ;;
        --uninstall) UNINSTALL=1 ;;
        --yes|-y)    ASSUME_YES=1 ;;
        --help|-h)   usage 0 ;;
        *) echo "unknown option: $1" >&2; usage 1 ;;
    esac
    shift
done

if [ ! -f "$SOURCE_DIR/metadata.json" ]; then
    echo "error: $SOURCE_DIR/metadata.json not found" >&2
    exit 1
fi

gnome_shell_version() {
    gnome-shell --version 2>/dev/null | awk '{print $3}' | cut -d. -f1
}

# --------------------------------------------------------------------------
# Uninstall
# --------------------------------------------------------------------------
if [ "$UNINSTALL" -eq 1 ]; then
    if [ -d "$TARGET_DIR" ]; then
        gnome-extensions disable "$UUID" 2>/dev/null || true
        if [ "$ASSUME_YES" -eq 0 ]; then
            read -r -p "Remove $TARGET_DIR? [y/N] " reply
            case "$reply" in
                [yY]*) ;;
                *) echo "aborted"; exit 0 ;;
            esac
        fi
        rm -rf -- "$TARGET_DIR"
        echo "removed $TARGET_DIR"
    else
        echo "nothing installed at $TARGET_DIR"
    fi

    dconf reset -f "/org/gnome/shell/extensions/deepseek-peak/" 2>/dev/null || true
    rm -f -- "$ZIP_PATH"
    echo "settings cleared. Log out and back in to drop the indicator."
    exit 0
fi

# --------------------------------------------------------------------------
# Sanity checks
# --------------------------------------------------------------------------
if ! command -v gnome-shell >/dev/null 2>&1; then
    echo "error: gnome-shell not found; this extension needs GNOME Shell 45 or newer" >&2
    exit 1
fi

SHELL_MAJOR="$(gnome_shell_version)"
if [ -n "$SHELL_MAJOR" ] && [ "$SHELL_MAJOR" -lt 45 ] 2>/dev/null; then
    echo "error: GNOME Shell $SHELL_MAJOR is too old; version 45 or newer is required" >&2
    exit 1
fi

if ! command -v glib-compile-schemas >/dev/null 2>&1; then
    echo "error: glib-compile-schemas not found (install libglib2.0-bin)" >&2
    exit 1
fi

# --------------------------------------------------------------------------
# Install
# --------------------------------------------------------------------------
echo "Installing $UUID"
echo "  source: $SOURCE_DIR"
echo "  target: $TARGET_DIR"

mkdir -p "$EXTENSIONS_DIR"
if [ -e "$TARGET_DIR" ] || [ -L "$TARGET_DIR" ]; then
    rm -rf -- "$TARGET_DIR"
fi

if [ "$MODE" = "link" ]; then
    ln -s "$SOURCE_DIR" "$TARGET_DIR"
    echo "  mode:   symlink (edits take effect after a shell reload)"
else
    cp -r "$SOURCE_DIR" "$TARGET_DIR"
    echo "  mode:   copy"
fi

# A stale gschemas.compiled would shadow the key definitions.
rm -f -- "$TARGET_DIR/schemas/gschemas.compiled"
glib-compile-schemas "$TARGET_DIR/schemas"

if [ "$BUILD_ZIP" -eq 1 ]; then
    rm -f -- "$ZIP_PATH"
    ( cd "$SOURCE_DIR" && zip -qr "$ZIP_PATH" . -x '*.compiled' )
    echo "  zip:    $ZIP_PATH"
fi

# --------------------------------------------------------------------------
# Enable
# --------------------------------------------------------------------------
if ! gnome-extensions list >/dev/null 2>&1; then
    echo
    echo "Done. Could not reach the running GNOME Shell, so enable it yourself:"
    echo "  log out and back in, then: gnome-extensions enable $UUID"
    exit 0
fi

if gnome-extensions enable "$UUID" 2>/dev/null; then
    echo "Enabled."
else
    echo
    echo "Installed, but GNOME Shell needs a reload before it can be enabled."
    echo "On X11 press Alt+F2, type 'r', press Enter. On Wayland log out and back in."
    echo "Then run: gnome-extensions enable $UUID"
fi

cat <<EOF

The indicator now sits next to the clock in the top bar.
  left-click  : peak status, next rate change, today's windows, prices
  right-click : settings, pricing documentation

Handy commands:
  gnome-extensions info $UUID
  gsettings get  $SCHEMA_ID panel-mode
  gsettings set  $SCHEMA_ID panel-mode 'time'   # words|time|dot|clock|none
  ./install.sh --uninstall

Terminal equivalent of the same rules:
  ./bin/deepseek-peak
EOF
