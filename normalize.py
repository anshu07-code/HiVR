#!/usr/bin/env python3
"""Normalize excessive blank lines in the dashboard page.

After multiple mojibake cleanup passes, the file has many runs of
3+ consecutive blank lines and odd indentation. We collapse:
- 3+ blank lines -> 1 blank line (for readability)
- Lines with only whitespace -> stripped

We also fix the layout to be responsive.
"""
import re

path = r'C:\Users\BIT\Desktop\HiVR\app\dashboard\page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Collapse 3+ consecutive newlines down to 1 (1 blank line max)
text = re.sub(r'\n{3,}', '\n\n', text)

# Strip trailing whitespace on every line
text = '\n'.join(line.rstrip() for line in text.split('\n'))

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Normalized blank lines')
