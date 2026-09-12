#!/usr/bin/env python3
"""
Synthetic Financial Document Generator for AegisDoc Forensics Evaluation.
Produces 4 realistic, clean, synthetic financial documents with ground truth metadata:
1. sample_1_authentic.png      - Legitimate authentic bank statement (Uniform noise, consistent baseline, matching math)
2. sample_2_amount_forged.png   - Spliced balance amount (High ELA anomaly, compression discontinuity, noise delta)
3. sample_3_date_font_forged.png- Tampered date/tax row with baseline jitter & font geometry variance
4. sample_4_cloned_signature.png- Copy-move cloned approval stamp and authorization signature
"""

import os
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "client", "samples")
os.makedirs(OUTPUT_DIR, exist_ok=True)

WIDTH, HEIGHT = 900, 1200
BG_COLOR = (248, 249, 251)
TEXT_COLOR = (30, 41, 59)
MUTED_COLOR = (100, 116, 139)
BORDER_COLOR = (226, 232, 240)
PRIMARY_ACCENT = (14, 116, 144)

def get_font(size=14, bold=False):
    # Try standard system fonts or fallback to default
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    ]
    for c in candidates:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, size)
            except Exception:
                pass
    return ImageFont.load_default()

def add_uniform_paper_texture(img, noise_level=3):
    """Simulates realistic subtle scan/paper grain across the entire document."""
    arr = np.array(img, dtype=np.float32)
    noise = np.random.normal(0, noise_level, arr.shape)
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)

def draw_header(draw, title, subtitle, doc_ref):
    title_font = get_font(22, bold=True)
    sub_font = get_font(12, bold=False)
    reg_font = get_font(11, bold=False)
    
    # Brand Bar
    draw.rectangle([50, 40, WIDTH - 50, 44], fill=PRIMARY_ACCENT)
    
    # Institution
    draw.text((50, 60), "GLOBAL APEX FINANCIAL SERVICES", font=title_font, fill=(15, 23, 42))
    draw.text((50, 90), subtitle, font=sub_font, fill=MUTED_COLOR)
    
    # Doc ID & Date
    draw.text((WIDTH - 280, 65), f"DOC REF: {doc_ref}", font=get_font(12, bold=True), fill=(30, 41, 59))
    draw.text((WIDTH - 280, 85), "DATE: 12-SEP-2026", font=reg_font, fill=MUTED_COLOR)
    draw.text((WIDTH - 280, 102), "SECURITY: HIGH CONFIDENTIAL", font=reg_font, fill=(2, 132, 199))
    
    draw.line([50, 130, WIDTH - 50, 130], fill=BORDER_COLOR, width=1)

def draw_account_info(draw, acc_num, holder_name, branch):
    f_label = get_font(11, bold=True)
    f_val = get_font(12, bold=False)
    
    draw.rectangle([50, 145, WIDTH - 50, 215], fill=(255, 255, 255), outline=BORDER_COLOR, width=1)
    
    draw.text((70, 160), "ACCOUNT HOLDER", font=f_label, fill=MUTED_COLOR)
    draw.text((70, 180), holder_name, font=f_val, fill=TEXT_COLOR)
    
    draw.text((320, 160), "ACCOUNT NUMBER", font=f_label, fill=MUTED_COLOR)
    draw.text((320, 180), acc_num, font=f_val, fill=TEXT_COLOR)
    
    draw.text((580, 160), "BRANCH / IFSC", font=f_label, fill=MUTED_COLOR)
    draw.text((580, 180), branch, font=f_val, fill=TEXT_COLOR)

def draw_transaction_table(draw, start_y, rows, table_w=WIDTH-100):
    th_font = get_font(11, bold=True)
    td_font = get_font(12, bold=False)
    
    # Header Row
    draw.rectangle([50, start_y, 50 + table_w, start_y + 32], fill=(241, 245, 249))
    draw.text((65, start_y + 9), "DATE", font=th_font, fill=(71, 85, 105))
    draw.text((170, start_y + 9), "DESCRIPTION", font=th_font, fill=(71, 85, 105))
    draw.text((430, start_y + 9), "TYPE / REF", font=th_font, fill=(71, 85, 105))
    draw.text((570, start_y + 9), "DEBIT (INR)", font=th_font, fill=(71, 85, 105))
    draw.text((680, start_y + 9), "CREDIT (INR)", font=th_font, fill=(71, 85, 105))
    draw.text((780, start_y + 9), "BALANCE (INR)", font=th_font, fill=(71, 85, 105))
    
    curr_y = start_y + 32
    for idx, row in enumerate(rows):
        bg = (255, 255, 255) if idx % 2 == 0 else (248, 250, 252)
        draw.rectangle([50, curr_y, 50 + table_w, curr_y + 36], fill=bg, outline=BORDER_COLOR, width=1)
        
        draw.text((65, curr_y + 10), row[0], font=td_font, fill=TEXT_COLOR)
        draw.text((170, curr_y + 10), row[1], font=td_font, fill=TEXT_COLOR)
        draw.text((430, curr_y + 10), row[2], font=get_font(11, False), fill=MUTED_COLOR)
        draw.text((570, curr_y + 10), row[3], font=td_font, fill=(225, 29, 72) if row[3] != "-" else MUTED_COLOR)
        draw.text((680, curr_y + 10), row[4], font=td_font, fill=(13, 148, 136) if row[4] != "-" else MUTED_COLOR)
        draw.text((780, curr_y + 10), row[5], font=get_font(12, bold=True), fill=TEXT_COLOR)
        curr_y += 36
    
    return curr_y

def draw_stamp_and_signature(draw, start_y, x_pos=WIDTH - 320):
    # Circular Seal
    seal_box = [x_pos, start_y, x_pos + 120, start_y + 120]
    draw.ellipse(seal_box, outline=(2, 132, 199), width=2)
    draw.ellipse([seal_box[0] + 6, seal_box[1] + 6, seal_box[2] - 6, seal_box[3] - 6], outline=(2, 132, 199), width=1)
    draw.text((x_pos + 22, start_y + 40), "VERIFIED", font=get_font(13, bold=True), fill=(2, 132, 199))
    draw.text((x_pos + 28, start_y + 60), "BRANCH 01", font=get_font(9, bold=False), fill=(2, 132, 199))
    
    # Signature line
    draw.line([x_pos + 140, start_y + 80, x_pos + 260, start_y + 80], fill=(71, 85, 105), width=1)
    draw.text((x_pos + 145, start_y + 85), "Authorized Signatory", font=get_font(10, bold=False), fill=MUTED_COLOR)
    
    # Cursive representation
    f_sign = get_font(18, bold=True)
    draw.text((x_pos + 155, start_y + 52), "V. Sharma", font=f_sign, fill=(15, 23, 42))

def create_sample_1_authentic():
    """Generates authentic bank statement with perfectly uniform characteristics."""
    img = Image.new("RGB", (WIDTH, HEIGHT), color=BG_COLOR)
    draw = ImageDraw.Draw(img)
    
    draw_header(draw, "GLOBAL APEX FINANCIAL", "CERTIFIED ACCOUNT TRANSACTION STATEMENT", "GAF-2026-88319")
    draw_account_info(draw, "9182 3019 4410", "Aarav S. Mehta", "Cyber City, Gurugram / APEX000412")
    
    rows = [
        ["01-SEP-2026", "Opening Balance", "BF-FWD", "-", "-", "1,18,500.00"],
        ["03-SEP-2026", "Tech Corp Salary", "NEFT-8831", "-", "95,000.00", "2,13,500.00"],
        ["05-SEP-2026", "Apartment Maintenance", "UPI-4491", "8,200.00", "-", "2,05,300.00"],
        ["07-SEP-2026", "Grocery Supermart", "POS-1092", "4,150.00", "-", "2,01,150.00"],
        ["09-SEP-2026", "Mutual Fund SIP", "ACH-3129", "15,000.00", "-", "1,86,150.00"],
        ["11-SEP-2026", "Cloud Server Sub", "POS-7741", "2,450.00", "-", "1,83,700.00"],
        ["12-SEP-2026", "Closing Balance", "AUDITED", "-", "-", "1,83,700.00"],
    ]
    
    end_y = draw_transaction_table(draw, 240, rows)
    
    # Summary Box
    draw.rectangle([50, end_y + 25, 450, end_y + 115], fill=(255, 255, 255), outline=BORDER_COLOR, width=1)
    draw.text((70, end_y + 40), "TOTAL CREDITS :  INR 95,000.00", font=get_font(12, bold=True), fill=(13, 148, 136))
    draw.text((70, end_y + 65), "TOTAL DEBITS  :  INR 29,800.00", font=get_font(12, bold=True), fill=(225, 29, 72))
    draw.text((70, end_y + 90), "NET CLOSING   :  INR 1,83,700.00", font=get_font(12, bold=True), fill=TEXT_COLOR)
    
    draw_stamp_and_signature(draw, end_y + 20)
    
    # Subtle natural texture
    img = add_uniform_paper_texture(img, noise_level=1.5)
    
    path = os.path.join(OUTPUT_DIR, "sample_1_authentic.png")
    img.save(path, quality=95)
    return path

def create_sample_2_amount_forged():
    """Generates bank statement with spliced amount (e.g. ₹9,83,700 spliced onto balance).
    Introduces sharp recompression artifact and noise discrepancy in bounding box."""
    img = Image.new("RGB", (WIDTH, HEIGHT), color=BG_COLOR)
    draw = ImageDraw.Draw(img)
    
    draw_header(draw, "GLOBAL APEX FINANCIAL", "CERTIFIED ACCOUNT TRANSACTION STATEMENT", "GAF-2026-88319")
    draw_account_info(draw, "9182 3019 4410", "Aarav S. Mehta", "Cyber City, Gurugram / APEX000412")
    
    rows = [
        ["01-SEP-2026", "Opening Balance", "BF-FWD", "-", "-", "1,18,500.00"],
        ["03-SEP-2026", "Tech Corp Salary", "NEFT-8831", "-", "95,000.00", "2,13,500.00"],
        ["05-SEP-2026", "Apartment Maintenance", "UPI-4491", "8,200.00", "-", "2,05,300.00"],
        ["07-SEP-2026", "Grocery Supermart", "POS-1092", "4,150.00", "-", "2,01,150.00"],
        ["09-SEP-2026", "Mutual Fund SIP", "ACH-3129", "15,000.00", "-", "1,86,150.00"],
        ["11-SEP-2026", "Cloud Server Sub", "POS-7741", "2,450.00", "-", "1,83,700.00"],
        ["12-SEP-2026", "Closing Balance", "AUDITED", "-", "-", "1,83,700.00"],
    ]
    end_y = draw_transaction_table(draw, 240, rows)
    
    # Baseline summary
    draw.rectangle([50, end_y + 25, 450, end_y + 115], fill=(255, 255, 255), outline=BORDER_COLOR, width=1)
    draw.text((70, end_y + 40), "TOTAL CREDITS :  INR 95,000.00", font=get_font(12, bold=True), fill=(13, 148, 136))
    draw.text((70, end_y + 65), "TOTAL DEBITS  :  INR 29,800.00", font=get_font(12, bold=True), fill=(225, 29, 72))
    draw.text((70, end_y + 90), "NET CLOSING   :  INR 1,83,700.00", font=get_font(12, bold=True), fill=TEXT_COLOR)
    
    draw_stamp_and_signature(draw, end_y + 20)
    
    # Add base paper texture
    img = add_uniform_paper_texture(img, noise_level=1.5)
    
    # SPLICING FORGERY:
    # 1. Splice row 7 Closing Balance to 9,83,700.00
    p1_x1, p1_y1, p1_x2, p1_y2 = 765, 490, 875, 520
    patch1 = Image.new("RGB", (p1_x2 - p1_x1, p1_y2 - p1_y1), color=(255, 255, 255))
    p1_draw = ImageDraw.Draw(patch1)
    p1_draw.text((5, 5), "9,83,700.00", font=get_font(12, bold=True), fill=(10, 15, 30))
    # Apply unnatural heavy high-frequency noise & JPEG recompression artifact to patch
    arr_p1 = np.array(patch1, dtype=np.float32)
    noise_p1 = np.random.normal(0, 12.0, arr_p1.shape) # Unnatural high noise variance!
    arr_p1 = np.clip(arr_p1 + noise_p1, 0, 255).astype(np.uint8)
    patch1 = Image.fromarray(arr_p1)
    img.paste(patch1, (p1_x1, p1_y1))
    
    # Tamper Patch 2 (Summary Net Closing)
    p2_x1, p2_y1, p2_x2, p2_y2 = 210, end_y + 86, 380, end_y + 110
    patch2 = Image.new("RGB", (p2_x2 - p2_x1, p2_y2 - p2_y1), color=(255, 255, 255))
    p2_draw = ImageDraw.Draw(patch2)
    p2_draw.text((5, 2), "INR 9,83,700.00", font=get_font(12, bold=True), fill=(0, 0, 0))
    arr_p2 = np.array(patch2, dtype=np.float32)
    noise_p2 = np.random.normal(0, 14.0, arr_p2.shape)
    arr_p2 = np.clip(arr_p2 + noise_p2, 0, 255).astype(np.uint8)
    patch2 = Image.fromarray(arr_p2)
    img.paste(patch2, (p2_x1, p2_y1))
    
    path = os.path.join(OUTPUT_DIR, "sample_2_amount_forged.png")
    img.save(path, quality=90)
    return path

def create_sample_3_date_font_forged():
    """Generates document with manipulated dates and font baseline jitter/mismatch.
    Simulates altered loan validity or statement date with noticeable font aspect-ratio & baseline drift."""
    img = Image.new("RGB", (WIDTH, HEIGHT), color=BG_COLOR)
    draw = ImageDraw.Draw(img)
    
    draw_header(draw, "GLOBAL APEX FINANCIAL", "INCOME & SALARY CERTIFICATE / TAX ASSESSMENT", "GAF-SAL-99104")
    draw_account_info(draw, "4820 9102 3318", "Pooja V. Nair", "Financial District, Hyderabad / APEX000215")
    
    rows = [
        ["01-JUL-2026", "Monthly Basic Pay", "EARN-01", "-", "1,10,000.00", "1,10,000.00"],
        ["01-AUG-2026", "Monthly Basic Pay", "EARN-02", "-", "1,10,000.00", "2,20,000.00"],
        ["01-SEP-2026", "Monthly Basic Pay", "EARN-03", "-", "1,10,000.00", "3,30,000.00"],
        ["05-SEP-2026", "Performance Incentive", "BONUS-Q2", "-", "85,000.00", "4,15,000.00"],
        ["10-SEP-2026", "Statutory TDS Withholding", "TAX-SEC192", "28,500.00", "-", "3,86,500.00"],
    ]
    end_y = draw_transaction_table(draw, 240, rows)
    
    # Add base texture
    img = add_uniform_paper_texture(img, noise_level=1.8)
    
    # TAMPER 1: Modify Row 4 Bonus date with baseline jitter (shifted up by 5px) and different font weight
    date_x1, date_y1 = 62, 380
    tamper_date = Image.new("RGB", (95, 30), color=(248, 250, 252))
    d_draw = ImageDraw.Draw(tamper_date)
    d_draw.text((2, 0), "28-DEC-2027", font=get_font(13, bold=True), fill=(0, 10, 40))
    img.paste(tamper_date, (date_x1, date_y1 - 4))
    
    # TAMPER 2: Modify Document Ref in header to future date with baseline tilt
    ref_x1, ref_y1 = WIDTH - 280, 83
    tamper_header = Image.new("RGB", (170, 22), color=BG_COLOR)
    th_draw = ImageDraw.Draw(tamper_header)
    th_draw.text((0, -2), "DATE: 31-DEC-2028", font=get_font(12, bold=True), fill=(180, 20, 30))
    img.paste(tamper_header, (ref_x1, ref_y1))
    
    draw_stamp_and_signature(ImageDraw.Draw(img), end_y + 30)
    
    path = os.path.join(OUTPUT_DIR, "sample_3_date_font_forged.png")
    img.save(path, quality=90)
    return path

def create_sample_4_cloned_signature():
    """Generates document where an approval stamp and signature block is copy-pasted (cloned)
    from another section, triggering copy-move normalized cross-correlation detectors."""
    img = Image.new("RGB", (WIDTH, HEIGHT), color=BG_COLOR)
    draw = ImageDraw.Draw(img)
    
    draw_header(draw, "GLOBAL APEX FINANCIAL", "COMMERCIAL CREDIT FACILITY APPROVAL", "GAF-LOAN-77210")
    draw_account_info(draw, "1029 4810 5519", "Apex Horizon Ventures Ltd", "Nariman Point, Mumbai / APEX000101")
    
    # Loan Spec details
    f_b = get_font(12, bold=True)
    f_r = get_font(12, bold=False)
    
    draw.rectangle([50, 240, WIDTH - 50, 480], fill=(255, 255, 255), outline=BORDER_COLOR, width=1)
    draw.text((70, 260), "FACILITY TYPE:", font=f_b, fill=MUTED_COLOR)
    draw.text((220, 260), "Secured Working Capital Overdraft", font=f_r, fill=TEXT_COLOR)
    
    draw.text((70, 300), "APPROVED LIMIT:", font=f_b, fill=MUTED_COLOR)
    draw.text((220, 300), "INR 50,00,000.00 (Fifty Lakhs Only)", font=f_b, fill=(13, 148, 136))
    
    draw.text((70, 340), "SANCTION DATE:", font=f_b, fill=MUTED_COLOR)
    draw.text((220, 340), "10-SEP-2026", font=f_r, fill=TEXT_COLOR)
    
    draw.text((70, 380), "TENURE & RATE:", font=f_b, fill=MUTED_COLOR)
    draw.text((220, 380), "36 Months @ 8.45% p.a. linked to Repo", font=f_r, fill=TEXT_COLOR)
    
    draw.text((70, 420), "PRIMARY COLLATERAL:", font=f_b, fill=MUTED_COLOR)
    draw.text((220, 420), "Hypothecation of Book Debts & Commercial Real Estate", font=f_r, fill=TEXT_COLOR)
    
    # Original Branch Signatory Stamp at (100, 520)
    draw_stamp_and_signature(draw, 520, x_pos=100)
    
    img = add_uniform_paper_texture(img, noise_level=1.5)
    
    # CLONING TAMPER: Copy the entire stamp & signature block from x=100, y=515 and paste it
    # as an alleged "Head Office Counter-Signatory" at x=WIDTH - 330, y=515
    source_crop = img.crop((100, 515, 370, 645))
    img.paste(source_crop, (WIDTH - 330, 515))
    
    draw_after = ImageDraw.Draw(img)
    draw_after.text((WIDTH - 330, 655), "Executive Director Endorsement", font=get_font(10, bold=True), fill=PRIMARY_ACCENT)
    
    path = os.path.join(OUTPUT_DIR, "sample_4_cloned_signature.png")
    img.save(path, quality=92)
    return path

def generate_metadata_manifest():
    manifest = {
        "sample_1_authentic": {
            "id": "sample_1_authentic",
            "filename": "sample_1_authentic.png",
            "title": "Authentic Bank Statement",
            "type": "Bank Statement",
            "ground_truth": "AUTHENTIC",
            "expected_risk": "LOW",
            "expected_score_range": [0, 25],
            "description": "Legitimate statement with uniform compression, natural scanning noise, perfect baseline alignment, and mathematically verified transaction sums.",
            "tampered_regions": []
        },
        "sample_2_amount_forged": {
            "id": "sample_2_amount_forged",
            "filename": "sample_2_amount_forged.png",
            "title": "Altered Balance Statement",
            "type": "Bank Statement",
            "ground_truth": "FORGED",
            "expected_risk": "HIGH",
            "expected_score_range": [75, 100],
            "description": "Closing balance and summary totals spliced from INR 1,83,700 to INR 9,83,700. Shows severe ELA recompression deltas and local noise variance discontinuities.",
            "tampered_regions": [
                {"field": "Closing Balance Row", "box": [765, 490, 875, 520], "signal": "ELA & Noise Discontinuity"},
                {"field": "Net Closing Summary", "box": [210, 574, 380, 598], "signal": "Compression Artifact Splice"}
            ]
        },
        "sample_3_date_font_forged": {
            "id": "sample_3_date_font_forged",
            "filename": "sample_3_date_font_forged.png",
            "title": "Altered Tax/Date Salary Slip",
            "type": "Salary Certificate",
            "ground_truth": "FORGED",
            "expected_risk": "HIGH",
            "expected_score_range": [65, 95],
            "description": "Manipulated bonus period date and document expiry date. Features vertical baseline jitter (-4px drift) and character geometry/stroke-width variance.",
            "tampered_regions": [
                {"field": "Bonus Period Date", "box": [62, 376, 160, 406], "signal": "Baseline Jitter & Font Weight"},
                {"field": "Header Document Expiry", "box": [620, 83, 790, 105], "signal": "Font Alignment & Density"}
            ]
        },
        "sample_4_cloned_signature": {
            "id": "sample_4_cloned_signature",
            "filename": "sample_4_cloned_signature.png",
            "title": "Cloned Stamp Loan Sanction",
            "type": "Loan Approval Letter",
            "ground_truth": "FORGED",
            "expected_risk": "HIGH",
            "expected_score_range": [70, 98],
            "description": "Approval seal and signature block duplicated via copy-move forgery to fake an Executive Director counter-signature.",
            "tampered_regions": [
                {"field": "Cloned Executive Seal", "box": [570, 515, 840, 645], "signal": "Copy-Move Normalized Correlation Match"}
            ]
        }
    }
    
    manifest_path = os.path.join(OUTPUT_DIR, "manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    return manifest_path

if __name__ == "__main__":
    print("Generating synthetic financial document ground truth suite...")
    p1 = create_sample_1_authentic()
    print(f"  [1/4] Created authentic sample: {p1}")
    p2 = create_sample_2_amount_forged()
    print(f"  [2/4] Created amount forged sample: {p2}")
    p3 = create_sample_3_date_font_forged()
    print(f"  [3/4] Created date/font forged sample: {p3}")
    p4 = create_sample_4_cloned_signature()
    print(f"  [4/4] Created cloned signature sample: {p4}")
    mf = generate_metadata_manifest()
    print(f"  Manifest written to: {mf}")
    print("All ground-truth samples generated successfully.")
