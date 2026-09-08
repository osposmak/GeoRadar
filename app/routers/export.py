import io
import csv
from datetime import datetime
from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from app.database import get_db
from app.models import ParseRecord

router = APIRouter(prefix="/api/export", tags=["Экспорт"])

@router.get("/excel")
def export_excel(
    search: str = Query(None),
    city: str = Query(None),
    niche: str = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(ParseRecord)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                ParseRecord.city.ilike(s),
                ParseRecord.niche.ilike(s),
                ParseRecord.operator_name.ilike(s)
            )
        )
    if city:
        query = query.filter(ParseRecord.city.ilike(f"%{city.strip()}%"))
    if niche:
        query = query.filter(ParseRecord.niche.ilike(f"%{niche.strip()}%"))

    records = query.order_by(ParseRecord.parsed_date.desc(), ParseRecord.id.desc()).all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Журнал сборов GeoRadar"

    # Стилизация заголовков в фирменных цветах (#1E3FB2 / #2875FB)
    header_fill = PatternFill(start_color="1E3FB2", end_color="1E3FB2", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    cell_font = Font(name="Segoe UI", size=10)
    border_side = Side(style='thin', color="E2E8F0")
    cell_border = Border(left=border_side, right=border_side, top=border_side, bottom=border_side)

    headers = [
        "ID", "Город", "Ниша / Сфера", "Источник", "Статус",
        "Собрано контактов", "Ответственный", "Дата сбора", "Заметки", "Создано"
    ]
    ws.append(headers)

    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 28

    for row_idx, r in enumerate(records, start=2):
        ws.append([
            r.id,
            r.city,
            r.niche,
            r.source,
            r.status,
            r.records_count,
            r.operator_name,
            r.parsed_date.strftime("%d.%m.%Y") if r.parsed_date else "",
            r.notes or "",
            r.created_at.strftime("%d.%m.%Y %H:%M") if r.created_at else ""
        ])
        ws.row_dimensions[row_idx].height = 20
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.font = cell_font
            cell.border = cell_border
            if col_idx in (1, 6, 8, 10):
                cell.alignment = Alignment(horizontal="center", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")

    # Автоматическая ширина колонок
    col_widths = {1: 8, 2: 18, 3: 25, 4: 18, 5: 16, 6: 18, 7: 18, 8: 15, 9: 35, 10: 18}
    for col_idx, width in col_widths.items():
        ws.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = width

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"georadar_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    headers_response = {
        "Content-Disposition": f'attachment; filename="{filename}"'
    }
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers_response
    )


@router.get("/csv")
def export_csv(db: Session = Depends(get_db)):
    records = db.query(ParseRecord).order_by(ParseRecord.parsed_date.desc()).all()

    output = io.StringIO()
    # UTF-8 with BOM for Excel compatibility
    output.write('\ufeff')
    writer = csv.writer(output, delimiter=';')
    writer.writerow(["ID", "Город", "Ниша", "Источник", "Статус", "Собрано контактов", "Оператор", "Дата сбора", "Заметки"])

    for r in records:
        writer.writerow([
            r.id,
            r.city,
            r.niche,
            r.source,
            r.status,
            r.records_count,
            r.operator_name,
            r.parsed_date.strftime("%Y-%m-%d") if r.parsed_date else "",
            r.notes or ""
        ])

    mem = io.BytesIO(output.getvalue().encode('utf-8-sig'))
    filename = f"georadar_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        mem,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
