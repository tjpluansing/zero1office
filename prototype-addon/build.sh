#!/bin/sh
# Builds the main zero1office page: the original page, byte for byte, with the add-on appended.
# Usage: prototype-addon/build.sh <original.html> <out.html>
set -e
D=$(dirname "$0")
cp "$1" "$2"
{
  printf '\n<style>\n'; cat "$D/addon.css"; printf '</style>\n'
  printf '<script type="text/plain" id="z1LiveSrc">\n'; cat "$D/../public/office/live.js"; printf '</script>\n'
  printf '<script>\n'; cat "$D/addon.js"; printf '</script>\n'
  printf '<script>\n'; cat "$D/propgen.js"; printf '</script>\n'
  printf '<script>\n'; cat "$D/extras.js"; printf '</script>\n'
} >> "$2"
