# Tests for the lead parser bridge: cross-source dedupe and AI Offers export.
from app.lead_parser import build_search_urls, dedupe_leads, export_csv_bytes, normalize_phone_key
from app.routers.offers import parse_table_rows


def lead(**kw):
    base = dict(name='Ромашка', address='Краснодар, ул. Красная, 1', phones=['+7 (912) 390-00-90'], website='', rating=None, reviews_count=None, category='салон красоты', map_url='', source='2ГИС', city='Краснодар', niche='салон красоты', email='', telegram='', whatsapp='', vk='')
    base.update(kw)
    return base


def test_normalize_phone_key_treats_8_and_plus7_as_same():
    assert normalize_phone_key('8 (912) 390-00-90') == '79123900090'
    assert normalize_phone_key('+7 912 390-00-90') == '79123900090'
    assert normalize_phone_key('') == ''
    assert normalize_phone_key('123') == ''


def test_dedupe_merges_2gis_and_yandex_by_phone():
    a = lead(source='2ГИС', map_url='https://2gis.ru/krasnodar/firm/123', rating=4.5)
    b = lead(source='Яндекс Карты', phones=['89123900090'], website='https://romashka.ru', map_url='https://yandex.ru/maps/org/romashka/456', address='краснодар, ул красная 1')
    merged = dedupe_leads([a, b])
    assert len(merged) == 1
    one = merged[0]
    assert one['source'] == '2ГИС + Яндекс'
    assert one['website'] == 'https://romashka.ru'
    assert float(one['rating']) == 4.5
    assert len(one['phones']) == 1
    urls = one.get('map_urls') or [one.get('map_url')]
    assert 'https://2gis.ru/krasnodar/firm/123' in urls
    assert 'https://yandex.ru/maps/org/romashka/456' in urls


def test_dedupe_merges_by_name_and_address_without_phone():
    a = lead(phones=[], source='2ГИС', name='Салон Ромашка')
    b = lead(phones=[], source='Яндекс Карты', name='салон ромашка', address='Краснодар,  ул. Красная, 1 ')
    assert len(dedupe_leads([a, b])) == 1


def test_dedupe_keeps_different_points_separate():
    a = lead()
    b = lead(phones=['+7 (999) 111-22-33'], address='Краснодар, ул. Северная, 200')
    assert len(dedupe_leads([a, b])) == 2


def test_dedupe_keeps_same_brand_in_other_city_separate():
    a = lead()
    b = lead(city='Сочи', address='Сочи, ул. Красная, 1')
    assert len(dedupe_leads([a, b])) == 2


def test_build_search_urls_respects_service_choice():
    both = build_search_urls('салон красоты', 'Краснодар', 'both')
    assert set(both) == {'2ГИС', 'Яндекс Карты'}
    assert '2gis.ru' in both['2ГИС']
    assert 'yandex.ru/maps' in both['Яндекс Карты']
    only = build_search_urls('салон красоты', 'Краснодар', '2gis')
    assert list(only) == ['2ГИС']


def test_export_csv_roundtrips_through_offers_importer():
    data = export_csv_bytes([lead(website='https://romashka.ru', map_url='https://2gis.ru/krasnodar/firm/123')])
    parsed = parse_table_rows(data, 'parser_leads.csv')
    assert len(parsed) == 1
    row = parsed[0]
    assert row['company_name'] == 'Ромашка'
    assert row['phone'] == '+79123900090'
    assert row['city'] == 'Краснодар'
    assert row['website'] == 'romashka.ru'
    assert row['map_url'] == 'https://2gis.ru/krasnodar/firm/123'
    assert row['source'] == '2ГИС'
