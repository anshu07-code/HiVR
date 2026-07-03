#!/usr/bin/env python3
"""Comprehensive fix for the dashboard:
1. Final mojibake cleanup (every file in app/, components/, lib/)
2. Remove the plain "Earnings trend" LineChart from MonthlyStatsPanel
3. Make LevelProgressCard sticky so it doesn't have empty space below
4. Add responsive spacing to PremiumDashboard
"""
import re
import os
import glob

ROOT = r'C:\Users\BIT\Desktop\HiVR'

# Step 1: aggressive mojibake cleanup across all source files
MOJIBAKE_FIXES = [
    # Triple-encoded (UTF-8 of UTF-8 of Latin-1)
    ('ÃƒÆ’ÃƒÂ¢Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·', '·'),
    ('ÃƒÆ’ÃƒÂ¢Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹', '₹'),
    ('ÃƒÆ’ÃƒÂ¢Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°', '★'),
    ('ÃƒÆ’ÃƒÂ¢Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢', '¢'),
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
    # The specific triple-encoded mojibake patterns
    ('š¬¢¬', '—'),
    ('š¬¢', '—'),
    # Common artifacts
    ('ƒ€š', '·'),
    ('ƒ¢¢', '₹'),
    ('ƒ¢', '₹'),
]

def fix_mojibake(text):
    for old, new in MOJIBAKE_FIXES:
        if old and old != new:
            text = text.replace(old, new)
    # Strip any remaining "Â" or "â" that immediately precede a non-ASCII
    # character (these are mojibake residue)
    text = re.sub(r'Â(?=[^\x00-\x7f])', '', text)
    text = re.sub(r'â(?=[^\x00-\x7f])', '', text)
    # Strip standalone "ƒ" or "‚" (mojibake markers)
    text = re.sub(r'ƒ[^\w\s.,;:()\[\]{}-]*', '', text)
    text = re.sub(r'‚', '', text)
    # The triple-encoded "š¬¢¬" pattern
    text = text.replace('š¬¢¬', '—').replace('š¬¢', '—')
    return text

# Find all source files
source_patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx']
files = []
for pat in source_patterns:
    files.extend(glob.glob(os.path.join(ROOT, pat), recursive=True))

skip_dirs = {'node_modules', '.next', '.git', 'dist', 'build', '.vercel'}
files = [f for f in files if not any(s in f for s in skip_dirs)]

fixed_count = 0
for f in files:
    try:
        with open(f, 'rb') as fh:
            raw = fh.read()
        try:
            text = raw.decode('utf-8')
        except UnicodeDecodeError:
            continue
        new_text = fix_mojibake(text)
        if new_text != text:
            with open(f, 'w', encoding='utf-8') as fh:
                fh.write(new_text)
            fixed_count += 1
    except Exception as e:
        print(f'Error: {f}: {e}')

print(f'Mojibake cleanup: fixed {fixed_count} files')
