import sys
sys.stdout.reconfigure(encoding='utf-8')
import json
import os

csv_path = 'telegram_finance_channels.csv'
json_path = 'telegram_finance_channels.json'

print(f"CSV file size: {os.path.getsize(csv_path) / 1024 / 1024:.2f} MB")
print(f"JSON file size: {os.path.getsize(json_path) / 1024 / 1024:.2f} MB")

with open(json_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Total channels loaded: {len(data)}")

print("\n--- Top 10 Channels by Subscribers ---")
for i, c in enumerate(data[:10], 1):
    print(f"{i}. {c['name']} (@{c['username']}) - {c['subscribers']:,} subs | Heat: {c['heat']} | Seen: {c['sightings']:,}")

print("\n--- Top 10 Channels by Ad Catches (Sightings) ---")
by_sightings = sorted(data, key=lambda x: x['sightings'], reverse=True)[:10]
for i, c in enumerate(by_sightings, 1):
    print(f"{i}. {c['name']} (@{c['username']}) - {c['sightings']:,} sightings | {c['subscribers']:,} subs | Heat: {c['heat']}")
