import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";

// Usage: node extract-pages-from-pdf.js [pdf-path] [start-page-num] [end-page-num] [page-number-offset]
// Example usage: node extract-pages-from-pdf.js ./my-pdf.pdf 0 5 5
const [pdfPath, startPageNumStr, endPageNumStr, pageNumberOffsetStr] =
  process.argv.slice(2);

// arguments are strings, so we need to convert them to integers
const startPageNum = parseInt(startPageNumStr, 10);
const endPageNum = parseInt(endPageNumStr, 10);
// page number offset is added to the page number,
// in case the page number in the bottom corner of the page is different to the actual page number
const pageNumberOffset = parseInt(pageNumberOffsetStr, 10) || 0;

const newPdfBytes = await extractPdfPages(
  pdfPath,
  startPageNum,
  endPageNum,
  pageNumberOffset,
);

const pdfFilename = path.basename(pdfPath, ".pdf");
const newPdfTitle = `${pdfFilename}_pages_${startPageNum}_to_${endPageNum}.pdf`;

fs.writeFileSync(newPdfTitle, newPdfBytes);

async function extractPdfPages(
  pdfPath,
  startPageNum,
  endPageNum,
  pageNumberOffset,
) {
  const fullPdfBytes = fs.readFileSync(pdfPath);

  // Load a PDFDocument from the existing PDF bytes
  const fullPdfDoc = await PDFDocument.load(fullPdfBytes);

  const startPageIndex = startPageNum - 1 + pageNumberOffset;
  const endPageIndex = endPageNum - 1 + pageNumberOffset;

  console.log({ startPageIndex, endPageIndex });

  // get page numbers from start to end
  const pageIndices = Array.from(
    { length: endPageIndex - startPageIndex + 1 },
    (_, i) => i + startPageIndex,
  );

  const newPdf = await PDFDocument.create();
  const copiedPages = await newPdf.copyPages(fullPdfDoc, pageIndices);

  for (const copiedPage of copiedPages) {
    newPdf.addPage(copiedPage);
  }

  const newPdfBytes = await newPdf.save();

  return newPdfBytes;
}
