import csv
import datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

BASE = r"C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build"

def epoch_to_dt(ms):
    return datetime.datetime.fromtimestamp(int(ms) / 1000.0)

def load_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        rows = list(reader)
    return rows[0], rows[1:]

wb = Workbook()

header_font = Font(bold=True, color="FFFFFF")
header_fill = PatternFill(start_color="FF4B4B7C", end_color="FF4B4B7C", fill_type="solid")

def write_sheet(ws, header, rows, ts_col_idx, extra_header="日時"):
    full_header = header[:ts_col_idx+1] + [extra_header] + header[ts_col_idx+1:]
    ws.append(full_header)
    for c in range(1, len(full_header) + 1):
        cell = ws.cell(row=1, column=c)
        cell.font = header_font
        cell.fill = header_fill
    for row in rows:
        dt = epoch_to_dt(row[ts_col_idx])
        new_row = row[:ts_col_idx+1] + [dt.strftime("%Y-%m-%d %H:%M")] + row[ts_col_idx+1:]
        ws.append(new_row)
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for c in range(1, len(full_header) + 1):
        max_len = max(
            [len(str(full_header[c-1]))] + [len(str(r[0])) for r in ws.iter_rows(min_row=2, max_col=c, min_col=c, values_only=True)]
        )
        ws.column_dimensions[get_column_letter(c)].width = min(max(max_len + 2, 10), 40)

r_header, r_rows = load_csv(f"{BASE}\\readings.csv")
ws1 = wb.active
ws1.title = "readings"
write_sheet(ws1, r_header, r_rows, ts_col_idx=1)

m_header, m_rows = load_csv(f"{BASE}\\moments.csv")
ws2 = wb.create_sheet("moments")
write_sheet(ws2, m_header, m_rows, ts_col_idx=1)

out_path = f"{BASE}\\StressLog_dummy_data.xlsx"
wb.save(out_path)
print(f"saved: {out_path}")
print(f"readings rows: {len(r_rows)}, moments rows: {len(m_rows)}")
