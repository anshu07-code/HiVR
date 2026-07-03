#!/usr/bin/env python3
"""Aggressively fix remaining mojibake in the entire project."""
import os
import re
import glob

# A list of common mojibake sequences we've seen, mapped to their
# correct UTF-8 character. We process them in length order
# (longest first) so e.g. "Ã‚Â·" is caught before "Â·".
REPLACEMENTS = [
    # Triple-encoded (UTF-8 of UTF-8 of Latin-1)
    ('ÃƒÆ’ÃƒÂ¢Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·', '·'),
    ('ÃƒÆ’ÃƒÂ¢Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹', '₹'),
    ('ÃƒÆ’ÃƒÂ¢Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°', '★'),
    ('ÃƒÆ’ÃƒÂ¢Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢', '¢'),  # "¢" (cent sign, used in ₹X notation)
    # Double-encoded
    ('Ã‚Â·', '·'),
    ('Ã‚Â¹', '₹'),
    ('Ã‚Â°', '★'),
    ('Ã‚Â¢', '¢'),
    # Single-encoded
    ('Â·', '·'),
    ('Â¹', '₹'),
    ('Â°', '★'),
    ('Â¢', '¢'),
    ('â‚¹', '₹'),
    ('â˜…', '★'),
    # Common artifacts
    ('ƒ€š', '·'),    # middle-dot
    ('ƒ¢', '₹'),     # rupee
    ('ƒ', ''),       # diacritic marker
    ('Å¾', ''),       # often a corruption marker
    ('Â', ''),       # combining mark left over
    ('â', ''),       # combining mark left over
    ('‚', ''),       # low-9 quotation mark
]

def fix(text):
    # Apply each replacement in order (longest first)
    for old, new in REPLACEMENTS:
        if old == '' or old == new:
            continue
        text = text.replace(old, new)
    # Strip any remaining Â or â that immediately precede a non-ASCII
    # character (indicates mojibake residue)
    text = re.sub(r'Â(?=[^\x00-\x7f])', '', text)
    text = re.sub(r'â(?=[^\x00-\x7f])', '', text)
    # Strip standalone diacritics left over
    text = re.sub(r'ƒ', '', text)
    text = re.sub(r'‚', '', text)
    return text

def fix_file(path):
    with open(path, 'rb') as f:
        raw = f.read()
    # Only process UTF-8 decodable files
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError:
        return False
    original = text
    new_text = fix(text)
    if new_text != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_text)
        return True
    return False

# Process all .ts, .tsx, .js, .jsx, .md files in the project
root = r'C:\Users\BIT\Desktop\HiVR'
patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.md']
files = []
for p in patterns:
    files.extend(glob.glob(os.path.join(root, p), recursive=True))

# Skip node_modules, .next, .git
skip_dirs = {'node_modules', '.next', '.git', 'dist', 'build', '.vercel'}
files = [f for f in files if not any(s in f for s in skip_dirs)]

changed = []
for f in files:
    try:
        if fix_file(f):
            changed.append(f)
    except Exception as e:
        print(f'Error processing {f}: {e}')

print(f'Processed {len(files)} files, fixed {len(changed)}')
for c in changed[:20]:
    print(f'  - {c}')
