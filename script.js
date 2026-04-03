/* =====================================================
   Convy — PDF Tools  |  script.js
   All processing is 100% client-side (browser only).
   Open index.html directly — no server needed.
   ===================================================== */

/* =====================
   PDF.js WORKER SETUP
   ===================== */
if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

/* =====================
   TAB SWITCHING
   ===================== */
const tabs   = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".tool-panel");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t)   => { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
    panels.forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    const panel = document.getElementById(`tool-${tab.dataset.tool}`);
    if (panel) panel.classList.add("active");
  });
});

/* =====================
   SHARED HELPERS
   ===================== */

function formatSize(bytes) {
  if (bytes < 1024)           return `${bytes} B`;
  if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(file) {
  if (file.type.startsWith("image/")) return "🖼️";
  if (file.type === "application/pdf") return "📄";
  if (file.name.endsWith(".docx"))     return "📝";
  return "📁";
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

function getImageDimensions(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}

function detectImgFormat(dataUrl) {
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/png"))  return "PNG";
  if (dataUrl.startsWith("data:image/gif"))  return "GIF";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "JPEG";
}

function showStatus(boxEl, type, message) {
  boxEl.hidden    = false;
  boxEl.className = `status-box ${type}`;
  if (type === "loading") {
    boxEl.innerHTML = `<div class="spinner"></div><span>${message}</span>`;
  } else if (type === "success") {
    boxEl.innerHTML = `<span class="status-icon">✅</span><span>${message}</span>`;
  } else {
    boxEl.innerHTML = `<span class="status-icon">❌</span><span>${message}</span>`;
  }
}

function hideStatus(boxEl) {
  boxEl.hidden    = true;
  boxEl.className = "status-box";
  boxEl.innerHTML = "";
}

function downloadBlob(bytes, mimeType, filename) {
  const blob = new Blob([bytes], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function filterFiles(files, accepted) {
  return files.filter((f) =>
    accepted.some((a) => {
      if (a.startsWith("."))  return f.name.toLowerCase().endsWith(a);
      if (a.endsWith("/*"))   return f.type.startsWith(a.replace("/*", ""));
      return f.type === a;
    })
  );
}

/** Render text to jsPDF pages with wrapping */
function renderTextToPdf(pdf, text, fontSize, margin, lineHeight) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const maxW  = pageW - margin * 2;
  let y = margin + fontSize;

  pdf.setFontSize(fontSize);
  pdf.setTextColor(26, 35, 64);

  const paragraphs = text.split(/\n\n+/);
  for (const para of paragraphs) {
    const lines = pdf.splitTextToSize(para.trim(), maxW);
    for (const line of lines) {
      if (y + lineHeight > pageH - margin) {
        pdf.addPage();
        y = margin + fontSize;
      }
      pdf.text(line, margin, y);
      y += lineHeight;
    }
    y += lineHeight * 0.6;
  }
}

/** Wrap text to max characters per line */
function wrapText(text, maxChars) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = line ? line + " " + word : word;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

/** Strip HTML tags from mammoth output */
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* =====================
   DROP ZONE SETUP
   ===================== */
function setupDropZone(zone, input, acceptedExts, onFiles) {
  zone.addEventListener("click",   () => input.click());
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
  });
  input.addEventListener("change", () => {
    const files = filterFiles(Array.from(input.files || []), acceptedExts);
    input.value = "";
    if (files.length) onFiles(files);
  });
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", (e) => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove("drag-over");
  });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const files = filterFiles(Array.from(e.dataTransfer.files), acceptedExts);
    if (files.length) onFiles(files);
  });
}

/* =====================
   DOCX BUILDER (via JSZip)
   ===================== */
const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const PKG_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
</Relationships>`;

const WORD_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildDocx(pages) {
  const paragraphs = pages.flatMap((pageText, pi) => {
    const paras = pageText.split("\n").filter((l) => l.trim()).map(
      (line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`
    );
    if (pi < pages.length - 1) {
      paras.push(`<w:p><w:pPr><w:pageBreakBefore/></w:pPr></w:p>`);
    }
    return paras;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.join("\n    ")}
    <w:sectPr/>
  </w:body>
</w:document>`;
}

async function createDocxBlob(pages) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.file("_rels/.rels", PKG_RELS_XML);
  zip.file("word/document.xml", buildDocx(pages));
  zip.file("word/_rels/document.xml.rels", WORD_RELS_XML);
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/* ====================================================
   TOOL 1: IMAGE TO PDF
   ==================================================== */
const imgFiles    = [];
const imgPreviews = [];

const imgDropZone    = document.getElementById("img-drop-zone");
const imgInput       = document.getElementById("img-input");
const imgFileList    = document.getElementById("img-file-list");
const imgPreviewGrid = document.getElementById("img-previews");
const imgStatus      = document.getElementById("img-status");
const imgConvertBtn  = document.getElementById("img-convert-btn");
const imgClearBtn    = document.getElementById("img-clear-btn");

const IMAGE_TYPES = [
  ".jpg", ".jpeg", ".png", ".gif", ".webp",
  "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp",
];

setupDropZone(imgDropZone, imgInput, IMAGE_TYPES, (newFiles) => {
  newFiles.slice(0, 20 - imgFiles.length).forEach((f) => {
    imgFiles.push(f);
    imgPreviews.push(URL.createObjectURL(f));
  });
  renderImageList();
  hideStatus(imgStatus);
});

function renderImageList() {
  imgFileList.innerHTML = "";
  imgFiles.forEach((file, i) => {
    const li = document.createElement("li");
    li.className = "file-item";
    li.innerHTML = `
      <span class="file-item-icon">${getFileIcon(file)}</span>
      <div class="file-item-info">
        <div class="file-item-name" title="${file.name}">${file.name}</div>
        <div class="file-item-size">${formatSize(file.size)}</div>
      </div>
      <button class="file-remove" aria-label="Remove ${file.name}">✕</button>`;
    li.querySelector(".file-remove").addEventListener("click", () => {
      URL.revokeObjectURL(imgPreviews[i]);
      imgFiles.splice(i, 1);
      imgPreviews.splice(i, 1);
      renderImageList();
      hideStatus(imgStatus);
    });
    imgFileList.appendChild(li);
  });

  imgPreviewGrid.innerHTML = "";
  imgPreviews.slice(0, 6).forEach((url, i) => {
    const img = document.createElement("img");
    img.className = "preview-thumb";
    img.src = url;
    img.alt = imgFiles[i]?.name || "preview";
    imgPreviewGrid.appendChild(img);
  });
  if (imgPreviews.length > 6) {
    const more = document.createElement("div");
    more.className = "preview-more";
    more.textContent = `+${imgPreviews.length - 6}`;
    imgPreviewGrid.appendChild(more);
  }

  imgConvertBtn.disabled    = imgFiles.length === 0;
  imgConvertBtn.textContent = `Convert to PDF (${imgFiles.length})`;
  imgClearBtn.hidden        = imgFiles.length === 0;
}

imgClearBtn.addEventListener("click", () => {
  imgPreviews.forEach((u) => URL.revokeObjectURL(u));
  imgFiles.length = 0; imgPreviews.length = 0;
  renderImageList(); hideStatus(imgStatus);
});

imgConvertBtn.addEventListener("click", async () => {
  if (!imgFiles.length) return;
  imgConvertBtn.disabled = true;
  showStatus(imgStatus, "loading", "Converting images to PDF…");
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < imgFiles.length; i++) {
      const dataUrl = await readAsDataURL(imgFiles[i]);
      const { w, h } = await getImageDimensions(dataUrl);
      const ratio = Math.min(pageW / w, pageH / h);
      const imgW = w * ratio, imgH = h * ratio;
      if (i > 0) pdf.addPage();
      pdf.addImage(dataUrl, detectImgFormat(dataUrl), (pageW - imgW) / 2, (pageH - imgH) / 2, imgW, imgH);
    }
    pdf.save("convy-images.pdf");
    showStatus(imgStatus, "success", `PDF with ${imgFiles.length} image${imgFiles.length === 1 ? "" : "s"} — download started!`);
  } catch (err) {
    console.error(err);
    showStatus(imgStatus, "error", "Conversion failed. Please try again.");
  } finally {
    imgConvertBtn.disabled = imgFiles.length === 0;
  }
});

/* ====================================================
   TOOL 2: MERGE PDF
   ==================================================== */
const pdfFiles = [];

const pdfDropZone = document.getElementById("pdf-drop-zone");
const pdfInput    = document.getElementById("pdf-input");
const pdfFileList = document.getElementById("pdf-file-list");
const pdfStatus   = document.getElementById("pdf-status");
const pdfMergeBtn = document.getElementById("pdf-merge-btn");
const pdfClearBtn = document.getElementById("pdf-clear-btn");

setupDropZone(pdfDropZone, pdfInput, [".pdf", "application/pdf"], (newFiles) => {
  newFiles.slice(0, 30 - pdfFiles.length).forEach((f) => pdfFiles.push(f));
  renderPdfList(); hideStatus(pdfStatus);
});

function renderPdfList() {
  pdfFileList.innerHTML = "";
  pdfFiles.forEach((file, i) => {
    const li = document.createElement("li");
    li.className = "file-item";
    li.innerHTML = `
      <span class="file-item-icon">📄</span>
      <div class="file-item-info">
        <div class="file-item-name" title="${file.name}">${file.name}</div>
        <div class="file-item-size">${formatSize(file.size)}</div>
      </div>
      <button class="file-remove" aria-label="Remove ${file.name}">✕</button>`;
    li.querySelector(".file-remove").addEventListener("click", () => {
      pdfFiles.splice(i, 1); renderPdfList(); hideStatus(pdfStatus);
    });
    pdfFileList.appendChild(li);
  });
  pdfMergeBtn.disabled    = pdfFiles.length < 2;
  pdfMergeBtn.textContent = `Merge ${pdfFiles.length} PDF${pdfFiles.length === 1 ? "" : "s"}`;
  pdfClearBtn.hidden      = pdfFiles.length === 0;
}

pdfClearBtn.addEventListener("click", () => {
  pdfFiles.length = 0; renderPdfList(); hideStatus(pdfStatus);
});

pdfMergeBtn.addEventListener("click", async () => {
  if (pdfFiles.length < 2) { showStatus(pdfStatus, "error", "Add at least 2 PDFs to merge."); return; }
  pdfMergeBtn.disabled = true;
  showStatus(pdfStatus, "loading", "Merging PDFs…");
  try {
    const { PDFDocument } = PDFLib;
    const merged = await PDFDocument.create();
    let totalPages = 0;
    for (const file of pdfFiles) {
      let src;
      try { src = await PDFDocument.load(await readAsArrayBuffer(file)); }
      catch { showStatus(pdfStatus, "error", `"${file.name}" is not a valid PDF.`); pdfMergeBtn.disabled = false; return; }
      const count   = src.getPageCount();
      const indices = Array.from({ length: count }, (_, i) => i);
      (await merged.copyPages(src, indices)).forEach((p) => merged.addPage(p));
      totalPages += count;
    }
    downloadBlob(await merged.save(), "application/pdf", "convy-merged.pdf");
    showStatus(pdfStatus, "success", `Merged ${pdfFiles.length} files (${totalPages} pages) — download started!`);
  } catch (err) {
    console.error(err);
    showStatus(pdfStatus, "error", "Merge failed. Check your PDF files and try again.");
  } finally {
    pdfMergeBtn.disabled = pdfFiles.length < 2;
  }
});

/* ====================================================
   TOOL 3: PDF TO WORD
   ==================================================== */
let ptwFile = null;

const ptwDropZone   = document.getElementById("ptw-drop-zone");
const ptwInput      = document.getElementById("ptw-input");
const ptwFileList   = document.getElementById("ptw-file-list");
const ptwStatus     = document.getElementById("ptw-status");
const ptwConvertBtn = document.getElementById("ptw-convert-btn");
const ptwClearBtn   = document.getElementById("ptw-clear-btn");

setupDropZone(ptwDropZone, ptwInput, [".pdf", "application/pdf"], (files) => {
  ptwFile = files[0]; renderPtwList(); hideStatus(ptwStatus);
});

function renderPtwList() {
  ptwFileList.innerHTML = "";
  if (!ptwFile) { ptwConvertBtn.disabled = true; ptwClearBtn.hidden = true; return; }
  const li = document.createElement("li");
  li.className = "file-item";
  li.innerHTML = `
    <span class="file-item-icon">📄</span>
    <div class="file-item-info">
      <div class="file-item-name" title="${ptwFile.name}">${ptwFile.name}</div>
      <div class="file-item-size">${formatSize(ptwFile.size)}</div>
    </div>
    <button class="file-remove" aria-label="Remove">✕</button>`;
  li.querySelector(".file-remove").addEventListener("click", () => {
    ptwFile = null; renderPtwList(); hideStatus(ptwStatus);
  });
  ptwFileList.appendChild(li);
  ptwConvertBtn.disabled = false;
  ptwClearBtn.hidden     = false;
}

ptwClearBtn.addEventListener("click", () => {
  ptwFile = null; renderPtwList(); hideStatus(ptwStatus);
});

ptwConvertBtn.addEventListener("click", async () => {
  if (!ptwFile) return;
  ptwConvertBtn.disabled = true;
  showStatus(ptwStatus, "loading", "Extracting text from PDF…");
  try {
    const buffer = await readAsArrayBuffer(ptwFile);
    const pdf    = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pages  = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      showStatus(ptwStatus, "loading", `Reading page ${i} of ${pdf.numPages}…`);
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((it) => it.str).join(" "));
    }

    showStatus(ptwStatus, "loading", "Building Word document…");
    const blob     = await createDocxBlob(pages);
    const filename = ptwFile.name.replace(/\.pdf$/i, "") + ".docx";
    downloadBlob(await blob.arrayBuffer(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", filename);
    showStatus(ptwStatus, "success", `Converted ${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"} — Word document download started!`);
  } catch (err) {
    console.error(err);
    showStatus(ptwStatus, "error", "Conversion failed. Make sure the PDF is not encrypted.");
  } finally {
    ptwConvertBtn.disabled = false;
  }
});

/* ====================================================
   TOOL 4: PDF TO PPT
   ==================================================== */
let ptpFile = null;

const ptpDropZone   = document.getElementById("ptp-drop-zone");
const ptpInput      = document.getElementById("ptp-input");
const ptpFileList   = document.getElementById("ptp-file-list");
const ptpStatus     = document.getElementById("ptp-status");
const ptpConvertBtn = document.getElementById("ptp-convert-btn");
const ptpClearBtn   = document.getElementById("ptp-clear-btn");

setupDropZone(ptpDropZone, ptpInput, [".pdf", "application/pdf"], (files) => {
  ptpFile = files[0]; renderPtpList(); hideStatus(ptpStatus);
});

function renderPtpList() {
  ptpFileList.innerHTML = "";
  if (!ptpFile) { ptpConvertBtn.disabled = true; ptpClearBtn.hidden = true; return; }
  const li = document.createElement("li");
  li.className = "file-item";
  li.innerHTML = `
    <span class="file-item-icon">📄</span>
    <div class="file-item-info">
      <div class="file-item-name" title="${ptpFile.name}">${ptpFile.name}</div>
      <div class="file-item-size">${formatSize(ptpFile.size)}</div>
    </div>
    <button class="file-remove" aria-label="Remove">✕</button>`;
  li.querySelector(".file-remove").addEventListener("click", () => {
    ptpFile = null; renderPtpList(); hideStatus(ptpStatus);
  });
  ptpFileList.appendChild(li);
  ptpConvertBtn.disabled = false;
  ptpClearBtn.hidden     = false;
}

ptpClearBtn.addEventListener("click", () => {
  ptpFile = null; renderPtpList(); hideStatus(ptpStatus);
});

ptpConvertBtn.addEventListener("click", async () => {
  if (!ptpFile) return;
  ptpConvertBtn.disabled = true;
  showStatus(ptpStatus, "loading", "Extracting text from PDF…");
  try {
    const buffer = await readAsArrayBuffer(ptpFile);
    const pdf    = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pptx   = new PptxGenJS();
    pptx.layout  = "LAYOUT_16x9";

    for (let i = 1; i <= pdf.numPages; i++) {
      showStatus(ptpStatus, "loading", `Building slide ${i} of ${pdf.numPages}…`);
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      const rawText = content.items.map((it) => it.str).join(" ").trim();

      const slide = pptx.addSlide();

      // Slide number
      slide.addText(`${i} / ${pdf.numPages}`, { x: 8.7, y: 0.1, w: 0.8, h: 0.25, fontSize: 8, color: "6B7280" });

      if (rawText) {
        const title = rawText.slice(0, 80).trim();
        const body  = wrapText(rawText.slice(80).trim(), 90);

        slide.addText(title, {
          x: 0.4, y: 0.35, w: 9, h: 0.8,
          fontSize: 22, color: "1A2340", bold: true, wrap: true,
        });
        if (body) {
          slide.addText(body, {
            x: 0.4, y: 1.35, w: 9, h: 4.5,
            fontSize: 13, color: "374151", wrap: true, valign: "top",
          });
        }
      } else {
        slide.addText(`(Page ${i} — no extractable text)`, {
          x: 0.4, y: 2.5, w: 9, h: 1, fontSize: 16, color: "9CA3AF",
        });
      }
    }

    const filename = ptpFile.name.replace(/\.pdf$/i, "") + ".pptx";
    await pptx.writeFile({ fileName: filename });
    showStatus(ptpStatus, "success", `Created ${pdf.numPages} slide${pdf.numPages === 1 ? "" : "s"} — PowerPoint download started!`);
  } catch (err) {
    console.error(err);
    showStatus(ptpStatus, "error", "Conversion failed. Make sure the PDF is not encrypted.");
  } finally {
    ptpConvertBtn.disabled = false;
  }
});

/* ====================================================
   TOOL 5: WORD TO PDF
   ==================================================== */
let wtpFile = null;

const wtpDropZone   = document.getElementById("wtp-drop-zone");
const wtpInput      = document.getElementById("wtp-input");
const wtpFileList   = document.getElementById("wtp-file-list");
const wtpStatus     = document.getElementById("wtp-status");
const wtpConvertBtn = document.getElementById("wtp-convert-btn");
const wtpClearBtn   = document.getElementById("wtp-clear-btn");

const DOCX_TYPES = [
  ".docx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

setupDropZone(wtpDropZone, wtpInput, DOCX_TYPES, (files) => {
  wtpFile = files[0]; renderWtpList(); hideStatus(wtpStatus);
});

function renderWtpList() {
  wtpFileList.innerHTML = "";
  if (!wtpFile) { wtpConvertBtn.disabled = true; wtpClearBtn.hidden = true; return; }
  const li = document.createElement("li");
  li.className = "file-item";
  li.innerHTML = `
    <span class="file-item-icon">📝</span>
    <div class="file-item-info">
      <div class="file-item-name" title="${wtpFile.name}">${wtpFile.name}</div>
      <div class="file-item-size">${formatSize(wtpFile.size)}</div>
    </div>
    <button class="file-remove" aria-label="Remove">✕</button>`;
  li.querySelector(".file-remove").addEventListener("click", () => {
    wtpFile = null; renderWtpList(); hideStatus(wtpStatus);
  });
  wtpFileList.appendChild(li);
  wtpConvertBtn.disabled = false;
  wtpClearBtn.hidden     = false;
}

wtpClearBtn.addEventListener("click", () => {
  wtpFile = null; renderWtpList(); hideStatus(wtpStatus);
});

wtpConvertBtn.addEventListener("click", async () => {
  if (!wtpFile) return;
  wtpConvertBtn.disabled = true;
  showStatus(wtpStatus, "loading", "Reading Word document…");
  try {
    const buffer = await readAsArrayBuffer(wtpFile);
    let text = "";

    try {
      const htmlResult = await mammoth.convertToHtml({ arrayBuffer: buffer });
      text = stripHtml(htmlResult.value);
    } catch {
      const rawResult = await mammoth.extractRawText({ arrayBuffer: buffer });
      text = rawResult.value;
    }

    if (!text.trim()) {
      showStatus(wtpStatus, "error", "No text found in this Word document."); return;
    }

    showStatus(wtpStatus, "loading", "Building PDF…");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    renderTextToPdf(pdf, text, 11, 48, 16);

    const filename = wtpFile.name.replace(/\.(docx?|rtf)$/i, "") + ".pdf";
    pdf.save(filename);
    showStatus(wtpStatus, "success", "Word document converted — PDF download started!");
  } catch (err) {
    console.error(err);
    showStatus(wtpStatus, "error", "Conversion failed. Make sure the file is a valid .docx.");
  } finally {
    wtpConvertBtn.disabled = false;
  }
});
