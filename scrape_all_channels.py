import sys
sys.stdout.reconfigure(encoding='utf-8')
import os
import re
import csv
import json
import time
import math
import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed

RANGES = [
    (50, 88),
    (89, 127),
    (128, 166),
    (167, 205),
    (206, 283),
    (284, 361),
    (362, 439),
    (440, 517),
    (518, 673),
    (674, 829),
    (830, 985),
    (986, 1296),
    (1297, 1608),
    (1609, 1920),
    (1921, 2543),
    (2544, 3790),
    (3791, 5037),
    (5038, 10025),
    (10026, 20000),
]

BASE_URL = "https://gramdar.com/en/base"
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

def parse_page_channels(html):
    channels = []
    soup = BeautifulSoup(html, 'html.parser')
    table = soup.find('table')
    if not table:
        return channels
        
    rows = table.find('tbody').find_all('tr') if table.find('tbody') else table.find_all('tr')[1:]
    
    for tr in rows:
        tds = tr.find_all('td')
        if not tds:
            continue
            
        # Type
        col_type = tr.find('span', class_='tag')
        c_type = col_type.get_text(strip=True) if col_type else 'channel'
        
        # Username / identifier
        tgtcell = tr.find('td', class_='tgtcell')
        u_tag = tgtcell.find('a', href=re.compile(r'^/en/base/')) if tgtcell else None
        
        slug = ''
        username = ''
        if u_tag:
            href = u_tag.get('href', '')
            slug = href.split('/en/base/')[-1].split('#')[0].strip('/')
            raw_text = u_tag.get_text(strip=True)
            username = raw_text.lstrip('@')
            username = re.sub(r'[^a-zA-Z0-9_]', '', username)
        if not username:
            username = slug
            
        if not username:
            continue
            
        # Channel Name
        name_td = tr.find('td', {'data-label': 'Name'}) or (tds[2] if len(tds) > 2 else None)
        name = name_td.get_text(strip=True) if name_td else ''
        
        # Language
        lang_td = tr.find('td', {'data-label': 'Language'}) or (tds[3] if len(tds) > 3 else None)
        lang = lang_td.get_text(strip=True) if lang_td else ''
        
        # Subscribers & Growth
        subs_td = tr.find('td', {'data-label': 'Subscribers'}) or (tds[4] if len(tds) > 4 else None)
        subs_num = 0
        growth = ''
        if subs_td:
            grow_tag = subs_td.find('a', class_='grow')
            if grow_tag:
                growth = grow_tag.get_text(strip=True)
                grow_tag.decompose()
            raw_subs = subs_td.get_text(strip=True)
            try:
                subs_num = int(re.sub(r'[^\d]', '', raw_subs))
            except:
                subs_num = 0
                
        # Heat
        heat_td = tr.find('td', {'data-label': 'Heat'}) or (tds[5] if len(tds) > 5 else None)
        heat = ''
        if heat_td:
            grad = heat_td.find('span', class_='grad')
            if grad:
                heat = grad.get('data-word', '') or grad.get_text(strip=True)
            else:
                heat = heat_td.get_text(strip=True)
                
        # Sightings
        sight_td = tr.find('td', {'data-label': 'Sightings'}) or (tds[6] if len(tds) > 6 else None)
        sightings = 0
        if sight_td:
            try:
                sightings = int(re.sub(r'[^\d]', '', sight_td.get_text(strip=True)))
            except:
                sightings = 0
                
        # Creatives
        cr_td = tr.find('td', {'data-label': 'Creatives'}) or (tds[7] if len(tds) > 7 else None)
        creatives = 0
        if cr_td:
            try:
                creatives = int(re.sub(r'[^\d]', '', cr_td.get_text(strip=True)))
            except:
                creatives = 0
                
        # Last seen
        seen_td = tr.find('td', {'data-label': 'Last seen'}) or (tds[8] if len(tds) > 8 else None)
        last_seen = seen_td.get_text(strip=True) if seen_td else ''
        
        channels.append({
            'username': username,
            'name': name,
            'type': c_type,
            'telegram_url': f"https://t.me/{username}",
            'subscribers': subs_num,
            'growth_7d': growth,
            'language': lang,
            'heat': heat,
            'sightings': sightings,
            'creatives': creatives,
            'last_seen': last_seen,
            'gramdar_url': f"https://gramdar.com/en/base/{username}"
        })
        
    return channels

def fetch_page(session, s_min, s_max, page):
    params = [
        ('q', ''),
        ('interest', 'finance'),
        ('kind', 'channels'),
        ('lang', 'en'),
        ('gradus', ''),
        ('subs_min', str(s_min)),
        ('subs_max', str(s_max)),
        ('period', ''),
        ('date_from', ''),
        ('date_to', ''),
        ('sort', 'seen'),
        ('alive', '0'),
        ('alive', '1'),
        ('noscam', '0'),
        ('noscam', '1'),
        ('page', str(page))
    ]
    
    for attempt in range(4):
        try:
            resp = session.get(BASE_URL, params=params, headers=HEADERS, timeout=20)
            if resp.status_code == 200:
                return resp.text
            else:
                print(f"Warning: HTTP {resp.status_code} for range [{s_min}, {s_max}] page {page}, attempt {attempt+1}")
                time.sleep(2)
        except Exception as e:
            print(f"Error fetching range [{s_min}, {s_max}] page {page}, attempt {attempt+1}: {e}")
            time.sleep(2)
    return ""

def main():
    start_time = time.time()
    session = requests.Session()
    
    # Dictionary to deduplicate by username
    all_channels = {}
    
    total_ranges = len(RANGES)
    print(f"Starting crawl across {total_ranges} subscriber ranges...")
    
    for r_idx, (s_min, s_max) in enumerate(RANGES, start=1):
        print(f"\n--- [{r_idx}/{total_ranges}] Processing Range: {s_min} - {s_max} subs ---")
        
        # 1. Fetch page 1
        html_p1 = fetch_page(session, s_min, s_max, 1)
        if not html_p1:
            print(f"Failed to fetch page 1 for range [{s_min}, {s_max}]")
            continue
            
        soup = BeautifulSoup(html_p1, 'html.parser')
        pg_info = soup.find('span', class_='pg-info')
        total_in_range = 0
        if pg_info:
            m = re.search(r'Showing \d+–\d+ of (\d+)', pg_info.get_text())
            if m:
                total_in_range = int(m.group(1))
        
        if total_in_range == 0:
            print(f"Range [{s_min}, {s_max}] has 0 items or no info.")
            continue
            
        total_pages = math.ceil(total_in_range / 100)
        print(f"Total items in range: {total_in_range} ({total_pages} pages)")
        
        # Parse page 1 channels
        p1_channels = parse_page_channels(html_p1)
        for c in p1_channels:
            all_channels[c['username']] = c
            
        print(f"  Page 1: parsed {len(p1_channels)} channels (Unique so far: {len(all_channels)})")
        
        # If more than 1 page, fetch pages 2..total_pages concurrently
        if total_pages > 1:
            pages_to_fetch = list(range(2, total_pages + 1))
            
            with ThreadPoolExecutor(max_workers=4) as executor:
                future_to_page = {
                    executor.submit(fetch_page, session, s_min, s_max, p): p 
                    for p in pages_to_fetch
                }
                for future in as_completed(future_to_page):
                    p_num = future_to_page[future]
                    p_html = future.result()
                    if p_html:
                        chs = parse_page_channels(p_html)
                        for c in chs:
                            all_channels[c['username']] = c
                        print(f"  Page {p_num}: parsed {len(chs)} channels (Unique so far: {len(all_channels)})")
                    else:
                        print(f"  Page {p_num}: FAILED to get content!")
                        
        # Save intermediate snapshot every 5 ranges
        if r_idx % 5 == 0 or r_idx == total_ranges:
            save_results(all_channels, is_intermediate=True)
            
    # Final save
    print(f"\n==========================================")
    print(f"Crawling completed in {time.time() - start_time:.1f} seconds!")
    print(f"Total unique channels collected: {len(all_channels)}")
    save_results(all_channels, is_intermediate=False)

def save_results(all_channels, is_intermediate=False):
    channels_list = list(all_channels.values())
    # Sort by subscribers descending
    channels_list.sort(key=lambda x: x['subscribers'], reverse=True)
    
    csv_file = "telegram_finance_channels.csv"
    json_file = "telegram_finance_channels.json"
    
    # Save CSV with UTF-8 BOM
    fieldnames = [
        'username', 'name', 'type', 'subscribers', 'growth_7d', 
        'language', 'heat', 'sightings', 'creatives', 'last_seen', 
        'telegram_url', 'gramdar_url'
    ]
    
    with open(csv_file, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(channels_list)
        
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(channels_list, f, ensure_ascii=False, indent=2)
        
    tag = "[SNAPSHOT]" if is_intermediate else "[FINAL]"
    print(f"{tag} Saved {len(channels_list)} channels to {csv_file} and {json_file}")

if __name__ == '__main__':
    main()
