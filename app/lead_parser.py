'''Модуль-мост парсера лидов GeoRadar CRM.

Берет логику MapLeads Audit: нормализация телефонов, склейка дублей
2ГИС и Яндекс Карт, экспорт в формате импорта AI Офферы.
'''

import csv
import io
import re
from urllib.parse import quote, urlparse

LEGAL_TOKENS = {'ооо', 'ип', 'оао', 'зао', 'ао', 'пао', 'нпо', 'гуп', 'муп', 'фгуп', 'ooo', 'llc', 'ltd', 'gmbh'}


def _norm_text(value):
    text = str(value or '').lower().replace('ё', 'е')
    return re.sub(r'[^a-zа-я0-9]+', ' ', text).strip()


def _norm_name(name):
    tokens = _norm_text(name).split()
    kept = [t for t in tokens if t not in LEGAL_TOKENS]
    return ' '.join(kept)


def normalize_phone_key(raw):
    digits = re.sub(r'\D', '', str(raw or ''))
    if len(digits) < 10:
        return ''
    if len(digits) == 10:
        return '7' + digits
    if len(digits) > 11:
        digits = digits[-11:]
    if digits[0] == '8':
        return '7' + digits[1:]
    return digits


def _site_key(website):
    raw = str(website or '').strip()
    if not raw:
        return ''
    value = raw if '://' in raw else 'https://' + raw
    try:
        host = urlparse(value).hostname or ''
    except Exception:
        return ''
    host = host.lower()
    if host.startswith('www.'):
        host = host[4:]
    return host.rstrip('.')


def _name_address_key(lead):
    name = _norm_name(lead.get('name'))
    address = _norm_text(lead.get('address'))
    if not name or not address:
        return ''
    return name + '|' + address


def _lead_keys(lead):
    keys = set()
    phones = list(lead.get('phones') or [])
    if lead.get('phone'):
        phones.append(lead.get('phone'))
    for phone in phones:
        key = normalize_phone_key(phone)
        if key:
            keys.add('phone:' + key)
    site = _site_key(lead.get('website'))
    if site:
        keys.add('site:' + site)
    name_addr = _name_address_key(lead)
    if name_addr:
        keys.add('name_addr:' + name_addr)
    return keys


def _merge_into(existing, incoming):
    phones = list(existing.get('phones') or [])
    seen = {normalize_phone_key(p) for p in phones if normalize_phone_key(p)}
    for phone in incoming.get('phones') or []:
        key = normalize_phone_key(phone)
        if key:
            if key not in seen:
                seen.add(key)
                phones.append(phone)
        elif phone and phone not in phones:
            phones.append(phone)
    existing['phones'] = phones
    urls = list(existing.get('map_urls') or [])
    if not urls and existing.get('map_url'):
        urls = [existing.get('map_url')]
    for url in incoming.get('map_urls') or []:
        if url and url not in urls:
            urls.append(url)
    if incoming.get('map_url') and incoming.get('map_url') not in urls:
        urls.append(incoming.get('map_url'))
    existing['map_urls'] = urls
    if urls:
        existing['map_url'] = urls[0]
    for field in ['name', 'address', 'website', 'category', 'city', 'niche', 'email', 'telegram', 'whatsapp', 'vk']:
        if not existing.get(field) and incoming.get(field):
            existing[field] = incoming.get(field)
    if existing.get('rating') in (None, '') and incoming.get('rating') not in (None, ''):
        existing['rating'] = incoming.get('rating')
    if existing.get('reviews_count') in (None, '', 0) and incoming.get('reviews_count'):
        existing['reviews_count'] = incoming.get('reviews_count')
    old_source = str(existing.get('source') or '')
    new_source = str(incoming.get('source') or '')
    if new_source and new_source != old_source:
        combined = {old_source, new_source}
        if '2ГИС' in combined and 'Яндекс Карты' in combined:
            existing['source'] = '2ГИС + Яндекс'
        elif old_source == '2ГИС + Яндекс' or new_source == '2ГИС + Яндекс':
            existing['source'] = '2ГИС + Яндекс'
    return existing


def dedupe_leads(leads):
    result = []
    by_key = {}
    for lead in leads or []:
        item = dict(lead)
        item['phones'] = list(lead.get('phones') or [])
        urls = list(lead.get('map_urls') or [])
        if not urls and lead.get('map_url'):
            urls = [lead.get('map_url')]
        item['map_urls'] = urls
        keys = _lead_keys(item)
        existing = None
        item_city = _norm_text(item.get('city'))
        for key in keys:
            candidate = by_key.get(key)
            if candidate is None:
                continue
            candidate_city = _norm_text(candidate.get('city'))
            if item_city and candidate_city and item_city != candidate_city:
                continue
            existing = candidate
            break
        if existing is None:
            result.append(item)
            for key in keys:
                by_key[key] = item
        else:
            _merge_into(existing, item)
            for key in _lead_keys(item):
                if key not in by_key:
                    by_key[key] = existing
            for key in _lead_keys(existing):
                by_key[key] = existing
    return result


def build_search_urls(niche, city, service='both'):
    query = (str(niche or '').strip() + ' ' + str(city or '').strip()).strip()
    encoded = quote(query)
    svc = str(service or 'both').strip().lower()
    want_2gis = ('2gis' in svc or '2гис' in svc or svc in ('both', 'all', 'оба'))
    want_yandex = ('yandex' in svc or 'яндекс' in svc or svc in ('both', 'all', 'оба'))
    urls = {}
    if want_2gis:
        urls['2ГИС'] = 'https://2gis.ru/search/' + encoded
    if want_yandex:
        urls['Яндекс Карты'] = 'https://yandex.ru/maps/?text=' + encoded
    return urls


def export_csv_bytes(leads):
    headers = ['Компания', 'Телефон', 'Город', 'Ниша', 'Адрес', 'Сайт', 'Рейтинг', 'Отзывов', 'Ссылка на карты', 'Источник', 'Email', 'Telegram', 'WhatsApp', 'ВКонтакте', 'Точек в городе', 'Статус сайта', 'Дата проверки']
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';', lineterminator='\r\n')
    writer.writerow(headers)
    for lead in leads or []:
        phones = ', '.join(lead.get('phones') or [])
        if not phones and lead.get('phone'):
            phones = str(lead.get('phone'))
        map_urls = lead.get('map_urls') or []
        map_url = ' | '.join(map_urls) if map_urls else str(lead.get('map_url') or '')
        website = str(lead.get('website') or '')
        branches = len(map_urls) if map_urls else (lead.get('branches_count') or 1)
        writer.writerow([
            lead.get('name') or '',
            phones,
            lead.get('city') or '',
            lead.get('niche') or lead.get('category') or '',
            lead.get('address') or '',
            website,
            lead.get('rating') if lead.get('rating') not in (None, '') else '',
            lead.get('reviews_count') if lead.get('reviews_count') not in (None, '') else '',
            map_url,
            lead.get('source') or '',
            lead.get('email') or '',
            lead.get('telegram') or '',
            lead.get('whatsapp') or '',
            lead.get('vk') or '',
            branches,
            'Сайт работает' if website else 'Нет сайта в карточке',
            lead.get('checked_at') or '',
        ])
    return output.getvalue().encode('utf-8-sig')
