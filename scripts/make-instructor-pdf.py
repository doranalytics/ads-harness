"""Optional instructor artifact: python3 -m pip install reportlab, then run this file."""
from pathlib import Path
from html import escape
import re
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "output/pdf/ai301-ads-instructor-guide.pdf"
DEST.parent.mkdir(parents=True, exist_ok=True)
ORANGE = colors.HexColor("#ff6719")
INK = colors.HexColor("#26241f")
MUTED = colors.HexColor("#6b665d")
PAPER = colors.HexColor("#fcfaf6")
WIDTH = A4[0] - 88
styles = {
    "title": ParagraphStyle("Title", fontName="Times-Roman", fontSize=30, leading=34, textColor=INK, spaceAfter=16),
    "h2": ParagraphStyle("Heading", fontName="Times-Roman", fontSize=18, leading=22, textColor=INK, spaceBefore=14, spaceAfter=9, keepWithNext=True),
    "h3": ParagraphStyle("Subheading", fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=colors.HexColor("#b54208"), spaceBefore=10, spaceAfter=6, keepWithNext=True),
    "body": ParagraphStyle("Body", fontName="Helvetica", fontSize=10, leading=14, textColor=INK, spaceAfter=8, splitLongWords=True),
    "bullet": ParagraphStyle("Bullet", fontName="Helvetica", fontSize=10, leading=14, textColor=INK, leftIndent=13, firstLineIndent=0, bulletIndent=0, spaceAfter=7),
    "cell": ParagraphStyle("Cell", fontName="Helvetica", fontSize=8.7, leading=12, textColor=INK),
}

def inline(value):
    value = value.translate(str.maketrans({"\u2011": "-", "\u2013": "-", "\u2014": "-", "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u2192": " > ", "\u2026": "...", "\u00a0": " "}))
    value = escape(value)
    value = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", value)
    value = re.sub(r"`([^`]+)`", r'<font name="Courier">\1</font>', value)
    value = re.sub(r"https://[^\s<]+", lambda m: f'<link href="{m.group(0)}" color="#a9430a">{m.group(0)}</link>', value)
    return value

story = [Paragraph("HOW TO AI  /  301  /  INSTRUCTOR", styles["h3"])]
lines = (ROOT / "docs/class-talking-framework.md").read_text().splitlines()
i = 0
while i < len(lines):
    line = lines[i].strip()
    if not line:
        i += 1
        continue
    if line == "<!-- pagebreak -->":
        story.append(PageBreak())
        i += 1
        continue
    if line.startswith("|"):
        rows = []
        while i < len(lines) and lines[i].strip().startswith("|"):
            cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
            if not all(re.fullmatch(r"[-: ]+", c) for c in cells):
                rows.append([Paragraph(inline(c), styles["cell"]) for c in cells])
            i += 1
        widths = [52, 252, WIDTH-304] if len(rows[0]) == 3 else [85, 42, 74, 46, WIDTH-247]
        table = Table(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#fff2ea")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, 0), 1, ORANGE),
            ("LINEBELOW", (0, 1), (-1, -1), .4, colors.HexColor("#ded8ce")),
            ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]))
        story.append(table)
        continue
    heading = re.match(r"^(#{1,3}) (.+)$", line)
    if heading:
        story.append(Paragraph(inline(heading[2]), styles[{1: "title", 2: "h2", 3: "h3"}[len(heading[1])]]))
    elif line.startswith("- "):
        story.append(Paragraph(inline(line[2:]), styles["bullet"], bulletText="-"))
    elif re.match(r"^\d+\. ", line):
        number, text = line.split(". ", 1)
        story.append(Paragraph(inline(text), styles["bullet"], bulletText=number + "."))
    else:
        paragraph = [line]
        while i+1 < len(lines) and lines[i+1].strip() and not lines[i+1].strip().startswith(("#", "|", "- ", "<!--")):
            i += 1
            paragraph.append(lines[i].strip())
        story.append(Paragraph(inline(" ".join(paragraph)), styles["body"]))
    i += 1

def page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, *A4, fill=1, stroke=0)
    canvas.setStrokeColor(ORANGE)
    canvas.setLineWidth(2)
    canvas.line(44, A4[1]-31, A4[0]-44, A4[1]-31)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(44, 27, "How to AI 301  |  October 9, 2026  |  30 minutes teach + 30 minutes Q&A")
    canvas.drawRightString(A4[0]-44, 27, str(doc.page))
    canvas.restoreState()

doc = SimpleDocTemplate(str(DEST), pagesize=A4, rightMargin=44, leftMargin=44, topMargin=48, bottomMargin=48,
    title="How to AI 301: Ads harness instructor guide", author="Brian Doran / How to AI")
doc.build(story, onFirstPage=page, onLaterPages=page)
(ROOT / "docs/ai301-ads-instructor-guide.pdf").write_bytes(DEST.read_bytes())
print(f"Created {DEST}")
