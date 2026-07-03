#!/usr/bin/env python3
import sys

with open(r'C:\Users\BIT\Desktop\HiVR\app\dashboard\page.tsx', 'rb') as f:
    data = f.read()

idx = data.find(b'Currently {profileCompleteness}')
print(f'Found at byte {idx}')
print(f'Next 80 bytes: {data[idx:idx+80]!r}')
