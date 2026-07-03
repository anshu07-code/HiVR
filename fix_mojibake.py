#!/usr/bin/env python3
"""Fix remaining mojibake in dashboard page — target the specific known
strings we've been seeing."""
import re

path = r'C:\Users\BIT\Desktop\HiVR\app\dashboard\page.tsx'
with open(path, 'rb') as f:
    raw = f.read()

text = raw.decode('utf-8', errors='replace')

# Pattern A: "ƒ€š‚· ƒ¢¢‚¬Å¡" (the double-encoded middle-dot + rupee)
# We want: " · ₹"
# In UTF-8 these specific bytes are 0xC6 0x92 0xE2 0x82 0xAC 0xC5 0xA1 0xE2 0x82 0xB9
# We just substitute the whole specific pattern we see.
text = text.replace('ƒ€š‚· ƒ¢¢‚¬Å¡', ' · ')   # " · "

# Pattern B: "ƒ€š‚· ƒ¢¢‚¬Å¡" appears as separate sequences around ₹
# Anywhere " ƒ¢¢‚¬Å¡₹" appears, replace with " ₹"
text = text.replace('ƒ¢¢‚¬Å¡₹', '₹')

# Pattern C: "ƒ€š‚· ƒ¢¢‚¬Å¡" around "₹20,000"
text = text.replace('₹20,000', '₹20,000')  # already correct in some places

# Pattern D: " ƒ€š‚·"  (any standalone)
text = text.replace('ƒ€š‚·', '·')

# Catch any remaining "ƒ..." corruption
# In mojibake from UTF-8→Latin-1→UTF-8 chains, ƒ (U+0192) only appears
# as a corruption marker. Same with some other diacritics. Strip them.
# We can identify "ƒ" as a strong mojibake marker because it only appears
# in corrupted text.
text = re.sub(r'ƒ[^\w\s.,;:()\[\]{}-]*', '', text)
text = re.sub(r'‚', '', text)  # ‚ is also a mojibake marker
text = re.sub(r'Å[^\w\s.,;:()\[\]{}-]*', '', text)
text = re.sub(r'Â(?=[^\x00-\x7f])', '', text)
text = re.sub(r'â(?=[^\x00-\x7f])', '', text)

# Restore correct characters
text = text.replace('  ·  · ', ' · ')  # dedupe

# Final pass: replace "XP · " etc with proper formatting
# Look for orphan " · " and remove duplicates within strings
# (This is just cleanup of any remaining double-mo jibake artifacts)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Done')
