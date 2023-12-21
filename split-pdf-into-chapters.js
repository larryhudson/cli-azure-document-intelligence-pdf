import fs from "fs";
import { PDFDocument } from "pdf-lib";

async function readChaptersFromTextFile(textFilePath) {
  const textFileContents = fs.readFileSync(textFilePath, "utf8");
  const chapterLines = textFileContents.split("\n").filter(Boolean);
  const chapters = chapterLines.map((line, index) => {
    // last word on line is the page number
    // the rest is the title
    const words = line.split(" ");
    const pageNumberStr = words.at(-1);
    const pageNumber = parseInt(pageNumberStr, 10);
    const title = words.slice(0, -1).join(" ");
    return {
      title,
      pageNumber,
      chapterNumber: index + 1,
    };
  });
  return chapters;
}

async function splitPdfIntoChapters(pdfPath, chapters, pageNumberOffset) {
  const existingPdfBytes = fs.readFileSync(pdfPath);

  // Load a PDFDocument from the existing PDF bytes
  const pdfDoc = await PDFDocument.load(existingPdfBytes);

  for (const chapter of chapters) {
    const { title, pageNumber, chapterNumber } = chapter;
    // need to get the page number from the next chapter
    const nextChapter = chapters[chapters.indexOf(chapter) + 1];
    const nextChapterStart = nextChapter ? nextChapter.pageNumber : undefined;
    const thisChapterEnd = nextChapterStart ? nextChapterStart - 1 : undefined;
    console.log({ title, pageNumber, thisChapterEnd });

    const realPageNumberStart = pageNumber + pageNumberOffset;
    const realPageNumberEnd = thisChapterEnd + pageNumberOffset;

    // get page numbers from start to end
    const pageNumbers = Array.from(
      { length: realPageNumberEnd - realPageNumberStart + 1 },
      (_, i) => i + realPageNumberStart,
    );

    console.log(pageNumbers);

    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(pdfDoc, pageNumbers);

    for (const copiedPage of copiedPages) {
      newPdf.addPage(copiedPage);
    }

    const pdfBytes = await newPdf.save();
    const pdfTitle = `${chapterNumber}_${title}.pdf`;

    fs.writeFileSync(pdfTitle, pdfBytes);
  }
}

// Usage: node split-pdf-into-chapters.js [pdf-path] [chapters-file-path] [page-number-offset]
// Example usage: node split-pdf-into-chapters.js ./my-pdf.pdf ./chapters.txt 8
const [pdfPath, chaptersFilePath, pageNumberOffsetStr] = process.argv.slice(2);
const pageNumberOffset = parseInt(pageNumberOffsetStr, 10);
console.log(typeof pageNumberOffset);
const chapters = await readChaptersFromTextFile(chaptersFilePath);
console.log(chapters);
splitPdfIntoChapters(pdfPath, chapters, pageNumberOffset);
