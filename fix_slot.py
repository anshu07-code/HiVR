#!/usr/bin/env python3
"""Remove blank lines between <Button asChild> and its child element.

JSX treats blank lines between a parent element and its child as
text node children, which breaks Radix's <Slot> which expects a
single React element child. After the mojibake cleanup, the
file has lots of these empty lines that need collapsing.

The pattern is:
    <Button asChild ...>

      <Link ...>...</Link>
    </Button>

We want:
    <Button asChild ...>
      <Link ...>...</Link>
    </Button>
"""
import re

path = r'C:\Users\BIT\Desktop\HiVR\app\dashboard\page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Pattern: <Button asChild ...>\n+   <Link ...
# Replace all consecutive newlines + whitespace between <Button
# (or any asChild wrapper) and the next non-whitespace element child.

# More general: between any open tag that has asChild and its first
# child element, collapse newlines+spaces to a single newline.

# Strategy: find each "<Tag asChild ...>" line, then find the next
# "<" (which starts the child element), and remove all blank lines
# between them. This is more conservative than a blanket regex.

# Pattern: match the open tag and then any whitespace until the next '<'
# of the child element, then optionally a newline.

def collapse(match):
    full = match.group(0)
    # Find the position right after the opening tag's '>'
    close_bracket = full.index('>')
    before = full[:close_bracket + 1]
    after_open = full[close_bracket + 1:]
    # Find first '<' in the rest
    child_idx = after_open.find('<')
    if child_idx < 0:
        return full
    # Get any whitespace between '>' and '<'
    whitespace = after_open[:child_idx]
    # The child element (and everything after)
    child_and_after = after_open[child_idx:]
    return before + '\n        ' + child_and_after

# Match "asChild" open tag followed by blank lines + child element
# We use a non-greedy regex to match the smallest possible range.
# This pattern matches: <Tag ... asChild ...> ... <Child ...
# It requires the child element to start on its own line (with
# indentation matching).

# More targeted: match patterns like:
#   <Button asChild ...>
#
#     <Link ...>
# Replace with: <Button asChild ...>\n        <Link ...>
pattern = re.compile(
    r'(<[A-Z][a-zA-Z]*[^<>]*?asChild[^<>]*?>)\s*\n\s*\n\s*(<)',
    re.MULTILINE
)

count = 0
while True:
    new_text, n = pattern.subn(collapse, text)
    if n == 0:
        break
    text = new_text
    count += n

# Also handle similar pattern for other asChild wrappers (TooltipTrigger,
# DropdownMenuItem, etc.) - same fix applies
pattern2 = re.compile(
    r'(<[A-Z][a-zA-Z]*[^<>]*?asChild[^<>]*?>)\s*\n\s*\n\s*(<[A-Z])',
    re.MULTILINE
)
while True:
    new_text, n = pattern2.subn(collapse, text)
    if n == 0:
        break
    text = new_text
    count += n

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print(f'Collapsed {count} blank-line groups between asChild wrappers and their children')
