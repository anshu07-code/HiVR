#!/usr/bin/env python3
"""Final cleanup: replace the specific multi-byte mojibake
sequence that survived earlier passes. The intent was clearly
a dash/middle-dot separator."""

import re

path = r'C:\Users\BIT\Desktop\HiVR\app\dashboard\page.tsx'
with open(path, 'rb') as f:
    raw = f.read()

# Read as UTF-8 with replacement, do a sweep of bad sequences.
text = raw.decode('utf-8', errors='replace')

# Specific known bad sequences. The "š¬¢¬" pattern is the byte sequence
# 0xC5 0xA1 0xC2 0xAC 0xC2 0xA2 0xC2 0xAC 0xC2 0x9D which is a corrupted
# attempt at " · " (middle dot with spaces).
# Just replace it with an em-dash + spaces.

# Common patterns in the file
bad_patterns = [
    # The "š¬¢¬" sequence (and any prefix/suffix variations)
    (r'\s*š¬¢¬\s*', ' — '),
    (r'\s*š¬¢\s*', ' — '),
    # The "ƒ€š" sequence (already cleaned but in case)
    (r'\s*ƒ€š[^\w]*', ' · '),
    # The "ƒ¢¢" pattern
    (r'\s*ƒ¢¢[^\w]*', ' ₹'),
    # Any remaining "Ãƒ..." triple-encoded sequence
    (r'Ãƒ[^\w\s]+', ''),
    # Generic byte sequences that start with a mojibake marker
    (r'š¬[^\w\s]+', '—'),
    (r'š[¬¢][^\w\s]+', '—'),
]

count = 0
for pattern, replacement in bad_patterns:
    new_text, n = re.subn(pattern, replacement, text)
    if n > 0:
        text = new_text
        count += n

# Final sweep: strip any remaining "ƒ", "Å", "Â", "â" followed by
# non-ASCII, which are mojibake markers
text = re.sub(r'ƒ[^\w\s.,;:()\[\]{}-]*', '', text)
text = re.sub(r'Å[^\w\s.,;:()\[\]{}-]*', '', text)
text = re.sub(r'Â(?=[^\x00-\x7f])', '', text)
text = re.sub(r'â(?=[^\x00-\x7f])', '', text)

# Detect "š¬¢¬" again and replace with " — " (em-dash with spaces)
text = text.replace('š¬¢¬', '—')
text = text.replace('š¬¢', '—')

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print(f'Applied {count} pattern replacements')
