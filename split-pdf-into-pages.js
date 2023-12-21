import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";

async function splitPdfIntoPages(pdfPath, startPageIndex, endPageIndex) {
  const existingPdfBytes = fs.readFileSync(pdfPath);

  const outputFolderName = "pdf-pages";

  if (!fs.existsSync(outputFolderName)) {
    fs.mkdirSync(outputFolderName);
  }

  // Load a PDFDocument from the existing PDF bytes
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const pageCount = pdfDoc.getPageCount();

  if (startPageIndex > pageCount) {
    throw new Error(
      `startPageIndex ${startPageIndex} is greater than pageCount ${pageCount}`,
    );
  }

  if (endPageIndex > pageCount) {
    throw new Error(
      `endPageIndex ${endPageIndex} is greater than pageCount ${pageCount}`,
    );
  }

  const pageIndices = Array.from(
    { length: endPageIndex - startPageIndex + 1 },
    (_, i) => i + startPageIndex,
  );

  for (const pageIndex of pageIndices) {
    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(pdfDoc, [pageIndex]);
    for (const copiedPage of copiedPages) {
      newPdf.addPage(copiedPage);
    }
    const pdfBytes = await newPdf.save();
    const pdfTitle = `${pageIndex}.pdf`;
    const outputPath = path.join(outputFolderName, pdfTitle);
    fs.writeFileSync(outputPath, pdfBytes);
    console.log(outputPath);
  }
}

const [pdfPath, startPageIndexStr, endPageIndexStr] = process.argv.slice(2);
const startPageIndex = parseInt(startPageIndexStr, 10);
const endPageIndex = parseInt(endPageIndexStr, 10);
splitPdfIntoPages(pdfPath, startPageIndex, endPageIndex);
