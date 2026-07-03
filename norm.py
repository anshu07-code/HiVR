#!/usr/bin/env python3
"""Normalize blank lines in a single file."""
import re
import sys

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r'\n{3,}', '\n\n', text)
text = '\n'.join(line.rstrip() for line in text.split('\n'))

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print(f'Normalized {path}')
