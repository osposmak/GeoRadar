import csv
import io
import json
import os
from datetime import date, datetime

from fastapi import APIRouter, Depends
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.lead_parser import build_search_urls, dedupe_leads, export_csv_bytes
from app.models import Company, ParseRecord
from app.schemas import ParserImportRequest, ParserRunCreate

router = APIRouter(prefix='/api/tools/parser', tags=['Парсер лидов'])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
SERVICE_LABELS = {'both': '2ГИС + Яндекс', 'all': '2ГИС + Яндекс', '2gis': '2ГИС', 'yandex': 'Яндекс Карты'}


def _load_json(name, default):
    try:
        with open(os.path.join(DATA_DIR, name), encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


@router.get('/meta')
def parser_meta():
    niches = _load_json('niches.json', [])
    cities_raw = _load_json('cities.json', [])
    cities = []
    for group in cities_raw:
        for item in group.get('items', []):
            if item.get('name'):
                cities.append(item['name'])
    return {'niches': niches, 'cities': cities, 'cities_grouped': cities_raw}


@router.post('/prepare')
def prepare_run(payload: ParserRunCreate):
    urls = build_search_urls(payload.niche, payload.city, payload.service)
    query = (payload.niche.strip() + ' ' + payload.city.strip()).strip()
    return {'query': query, 'urls': urls, 'city': payload.city, 'niche': payload.niche, 'service': payload.service}


def _service_label(service, leads):
    sources = {str(l.get('source') or '') for l in leads}
    if '2ГИС' in sources and 'Яндекс Карты' in sources:
        return '2ГИС + Яндекс'
    return SERVICE_LABELS.get(str(service or 'both').lower(), '2ГИС + Яндекс')


@router.post('/import')
def import_leads(payload: ParserImportRequest, db: Session = Depends(get_db)):
    raw = []
    for lead in payload.leads:
        item = lead.model_dump()
        item['city'] = item.get('city') or payload.city or ''
        item['niche'] = item.get('niche') or payload.niche or item.get('category') or ''
        item['phone'] = (item.get('phones') or [''])[0]
        raw.append(item)
    deduped = dedupe_leads(raw)
    city = (payload.city or (deduped[0].get('city') if deduped else '') or '').strip()
    niche = (payload.niche or (deduped[0].get('niche') if deduped else '') or '').strip()
    source = _service_label(payload.service, deduped)
    record = ParseRecord(city=city, niche=niche, source=source, status='Завершено', records_count=len(deduped), operator_name=(payload.operator_name or 'Менеджер').strip() or 'Менеджер', parsed_date=date.today(), notes=f'Парсер лидов (Инструменты): собрано {len(raw)}, после склейки дублей {len(deduped)}', file_attachment='parser_leads.csv')
    db.add(record)
    db.flush()
    for lead in deduped:
        phones = lead.get('phones') or []
        rating = lead.get('rating')
        try:
            rating_value = float(rating) if rating not in (None, '') else None
        except (TypeError, ValueError):
            rating_value = None
        urls = lead.get('map_urls') or ([lead.get('map_url')] if lead.get('map_url') else [])
        db.add(Company(parse_record_id=record.id, name=lead.get('name') or 'Без названия', city=lead.get('city') or city, niche=lead.get('niche') or niche, address=lead.get('address'), phone=', '.join(phones) if phones else None, website=lead.get('website') or None, email=lead.get('email') or None, rating=rating_value, reviews_count=int(lead.get('reviews_count') or 0), source=lead.get('source') or source, category=lead.get('category'), map_url=' | '.join(urls) if urls else None))
    db.commit()
    db.refresh(record)
    with_phone = sum(1 for l in deduped if l.get('phones'))
    without_site = sum(1 for l in deduped if not l.get('website'))
    return {'status': 'ok', 'parse_record_id': record.id, 'received': len(raw), 'saved': len(deduped), 'duplicates_merged': len(raw) - len(deduped), 'with_phone': with_phone, 'without_site': without_site, 'leads': deduped}


@router.post('/export/csv')
def export_csv(payload: ParserImportRequest):
    deduped = dedupe_leads([l.model_dump() for l in payload.leads])
    filename = f"parser_leads_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(content=export_csv_bytes(deduped), media_type='text/csv; charset=utf-8', headers={'Content-Disposition': f'attachment; filename="{filename}"'})


@router.post('/export/xlsx')
def export_xlsx(payload: ParserImportRequest):
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill
    deduped = dedupe_leads([l.model_dump() for l in payload.leads])
    text = export_csv_bytes(deduped).decode('utf-8-sig')
    rows = list(csv.reader(io.StringIO(text), delimiter=';'))
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'База обзвона'
    fill = PatternFill(start_color='1E3FB2', end_color='1E3FB2', fill_type='solid')
    font = Font(name='Segoe UI', size=11, bold=True, color='FFFFFF')
    for row in rows:
        ws.append(row)
    if rows:
        for col in range(1, len(rows[0]) + 1):
            cell = ws.cell(row=1, column=col)
            cell.fill = fill
            cell.font = font
            cell.alignment = Alignment(horizontal='center', vertical='center')
    widths = [28, 26, 16, 22, 32, 24, 10, 10, 35, 15, 20, 20, 20, 20, 12, 20, 18]
    for idx, width in enumerate(widths, start=1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(idx)].width = width
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    filename = f"parser_leads_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(output, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={'Content-Disposition': f'attachment; filename="{filename}"'})
