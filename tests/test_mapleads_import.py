import io

import openpyxl

from app.routers.offers import city_from_map_url, normalize_phones, normalize_site_status, parse_table_rows


def test_normalize_phones_filters_garbage_dedupes_and_marks_8800():
    phones, junk = normalize_phones('+7 (000) 184-53-22, +7 (912) 390-00-90; +7 (912) 390-00-90, +7 (800) 101-01-77, +73452530135,,,770')
    numbers = [p['number'] for p in phones]
    assert '+79123900090' in numbers
    assert numbers.count('+79123900090') == 1
    assert not any(n.startswith('+7000') for n in numbers)
    toll = [p for p in phones if p['number'] == '+78001010177']
    assert toll and toll[0].get('is_toll_free')
    main = [p for p in phones if p['number'] == '+73452530135']
    assert main and main[0].get('extension') == '770'
    assert junk >= 1
    assert len(phones) <= 50


def test_normalize_site_status_enum():
    assert normalize_site_status('Нет сайта в карточке') == 'no_site'
    assert normalize_site_status('Сайт не работает / Ошибка') == 'broken'
    assert normalize_site_status('Сайт медленный, без SSL') == 'weak'
    assert normalize_site_status('ok, работает') == 'ok'
    assert normalize_site_status('непонятное значение') == 'unknown'


def test_city_from_map_url():
    assert city_from_map_url('https://2gis.ru/tyumen/firm/70000001087762596') == 'Тюмень'
    assert city_from_map_url('https://2gis.ru/novosibirsk/firm/123') == 'Новосибирск'


def test_parse_old_format_still_works():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(['Компания', 'Телефон'])
    ws.append(['Форсаж', '+7 (912) 390-00-90'])
    buf = io.BytesIO()
    wb.save(buf)
    leads = parse_table_rows(buf.getvalue(), 'old.xlsx')
    assert len(leads) == 1
    assert leads[0]['company_name'] == 'Форсаж'
